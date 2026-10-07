/**
 * Répartition du revenu d'un séjour entre les mois qu'il traverse.
 *
 * Un séjour du 28 octobre au 3 novembre imputait auparavant la totalité de son
 * montant à octobre — son mois de début. Le chiffre d'affaires d'octobre
 * incluait donc des jours de novembre, et le taux d'occupation comptait les
 * jours entiers du séjour dans chaque fenêtre, d'où des taux dépassant 100 %
 * que le calcul plafonnait artificiellement.
 *
 * Le revenu réparti ici est le **revenu constaté** : il répond à « ce bien
 * a-t-il été rentable en octobre ». Il ne se confond pas avec l'encaissement
 * (acompte, montant reçu), qui relève de la trésorerie.
 */

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

export interface RevenueSlice {
  year: number
  /** Indexé comme `Date.getMonth()` : 0 pour janvier. */
  month: number
  days: number
  amount: number
}

/** Minuit au premier jour du mois suivant. */
function startOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
}

/**
 * Découpe un séjour en tranches mensuelles, montant réparti au prorata.
 *
 * Le reste d'arrondi est imputé à la dernière tranche : le FCFA n'a pas de
 * subdivision, et une division inexacte ferait disparaître des francs du
 * chiffre d'affaires. La somme des tranches égale donc toujours le montant.
 */
export function splitRevenueByMonth(start: Date, end: Date, amount: number): RevenueSlice[] {
  const totalMs = Math.max(0, end.getTime() - start.getTime())
  const totalDays = Math.max(1, Math.ceil(totalMs / MILLISECONDS_PER_DAY))

  // Durée exacte de chaque tranche, en millisecondes et sans arrondi.
  // Arrondir chaque tranche séparément ferait dépasser leur somme la durée
  // réelle du séjour — 7 jours pour un séjour de 6 — et ce total gonflé,
  // servant de dénominateur, décalerait tous les montants.
  const raw: Array<{ year: number; month: number; ms: number }> = []
  let cursor = start

  while (cursor < end) {
    const boundary = startOfNextMonth(cursor)
    const sliceEnd = boundary < end ? boundary : end

    raw.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth(),
      ms: sliceEnd.getTime() - cursor.getTime(),
    })

    cursor = sliceEnd
  }

  // Un séjour infra-journalier (sortie le jour même) ne franchit aucune borne
  // de mois et sortirait de la boucle sans aucune tranche.
  if (raw.length === 0) {
    raw.push({ year: start.getUTCFullYear(), month: start.getUTCMonth(), ms: totalMs })
  }

  let daysUsed = 0
  let distributed = 0

  return raw.map((slice, index) => {
    const isLast = index === raw.length - 1

    // Le reste va à la dernière tranche, pour que la somme des jours égale
    // exactement `totalDays` et celle des montants exactement `amount` : le
    // FCFA n'a pas de subdivision, et une division inexacte ferait
    // disparaître des francs du chiffre d'affaires.
    const days = isLast
      ? totalDays - daysUsed
      : Math.max(1, Math.round((totalDays * slice.ms) / totalMs))
    daysUsed += days

    // Le montant suit les jours attribués, et non la durée exacte : sans
    // cela, le montant et la durée affichés sur une même ligne se
    // contrediraient.
    const sliceAmount = isLast ? amount - distributed : Math.round((amount * days) / totalDays)
    distributed += sliceAmount

    return { year: slice.year, month: slice.month, days, amount: sliceAmount }
  })
}
