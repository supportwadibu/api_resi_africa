import Booking from '#models/booking'
import Expense from '#models/expense'
import Property from '#models/property'

import { stayTypeOccupancyDays } from '#features/bookings/stay_type'

import Residence from '#models/residence'

import { daysWithinWindow, splitRevenueByMonth } from '../revenue_split.ts'
import { sumResidenceExpenses } from '../residence_scope.ts'

import type { FinanceFilters, FinanceOverviewDto, RevenuePointDto } from '../dto/finance.dto.ts'
import type { RevenueSlice } from '../revenue_split.ts'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

/** Mois abrégés en français, indexés comme `Date.getMonth()`. */
const MONTH_LABELS = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
]

/** Réservation réduite à ce dont la répartition du revenu a besoin. */
type RevenueBooking = { start_date: Date; end_date: Date; total_amount: number }

/**
 * Tranches mensuelles de revenu retenues pour la fenêtre demandée.
 *
 * Passage unique du chiffre d'affaires : le graphique et le chiffre clé
 * dérivent des mêmes tranches. Les calculer séparément faisait afficher deux
 * montants contradictoires sur la même page — le graphique proratisé et
 * l'agrégat comptant en plus les mois voisins.
 */
function revenueSlicesInWindow(
  bookings: RevenueBooking[],
  range: { from?: Date; to?: Date }
): RevenueSlice[] {
  const kept: RevenueSlice[] = []

  for (const booking of bookings) {
    if (!booking.start_date) continue

    const end = booking.end_date ?? booking.start_date
    const slices = splitRevenueByMonth(booking.start_date, end, booking.total_amount ?? 0)

    for (const slice of slices) {
      // Une tranche hors fenêtre ne doit pas apparaître : le séjour chevauche
      // la borne, mais ces jours-là n'appartiennent pas à la période demandée.
      if (range.from && new Date(Date.UTC(slice.year, slice.month + 1, 1)) <= range.from) continue
      if (range.to && new Date(Date.UTC(slice.year, slice.month, 1)) >= range.to) continue

      kept.push(slice)
    }
  }

  return kept
}

/**
 * Revenu mensuel, du plus ancien au plus récent.
 *
 * Le montant d'un séjour était rattaché à son seul mois de début : un séjour
 * du 28 octobre au 3 novembre plaçait la totalité sur octobre. Il est
 * désormais réparti au prorata des jours de chaque mois traversé.
 */
export function aggregateRevenuePoints(
  bookings: RevenueBooking[],
  range: { from?: Date; to?: Date }
): RevenuePointDto[] {
  const buckets = new Map<string, { month: number; year: number; value: number }>()

  for (const slice of revenueSlicesInWindow(bookings, range)) {
    const key = `${slice.year}-${slice.month}`
    const bucket = buckets.get(key) ?? { month: slice.month, year: slice.year, value: 0 }
    bucket.value += slice.amount
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((bucket) => ({ month: MONTH_LABELS[bucket.month] ?? '', value: bucket.value }))
}

/**
 * Chiffre d'affaires brut de la fenêtre.
 *
 * Somme des mêmes tranches que le graphique plutôt que des `total_amount`
 * entiers : un séjour du 28 octobre au 3 novembre imputait sinon ses 60 000 F
 * à octobre *et* à novembre, si bien que le cumul des douze mois dépassait le
 * chiffre d'affaires réel. Sans fenêtre, aucune tranche n'est écartée et le
 * total reste le montant intégral de chaque réservation.
 */
export function aggregateGrossRevenue(
  bookings: RevenueBooking[],
  range: { from?: Date; to?: Date }
): number {
  return revenueSlicesInWindow(bookings, range).reduce((sum, slice) => sum + slice.amount, 0)
}

export class FinanceRepository {
  /**
   * Rapproche revenus et charges sur une période.
   *
   * Le bénéfice est la différence des deux : c'est le seul chiffre qui répond à
   * « ce bien me rapporte-t-il ? », et il n'a de sens que si les deux membres
   * portent sur la même fenêtre.
   */
  async overview(filters: FinanceFilters): Promise<FinanceOverviewDto | null> {
    const range = { from: filters.from, to: filters.to }

    const scope = filters.residence_id ? { residence_id: filters.residence_id } : {}

    // Les unités de la résidence sont nécessaires aux charges, pas au revenu :
    // celui-ci se lit sur le `residence_id` figé de chaque réservation.
    const unitIds = filters.residence_id
      ? new Set(await Property.findIdsByResidence(filters.residence_id))
      : null

    const [bookings, expenseSummary, propertyStats, residence] = await Promise.all([
      Booking.findForRevenue(filters.owner_id, range, scope),
      Expense.summary({ owner_id: filters.owner_id, ...range }),
      Property.statsByOwner(filters.owner_id),
      // `findByIdAndOwner` et non `findById` : sans le contrôle de propriété,
      // un identifiant deviné livrerait le relevé financier d’un autre compte.
      filters.residence_id
        ? Residence.findByIdAndOwner(filters.residence_id, filters.owner_id)
        : Promise.resolve(null),
    ])

    const caBrut = aggregateGrossRevenue(bookings, range)

    // Hors périmètre résidence, le total du propriétaire suffit. Restreint à
    // une résidence, il faut sommer ses charges communes **et** celles de ses
    // unités — deux champs distincts, qui ne se rencontrent qu’ici.
    const depenses =
      filters.residence_id && unitIds
        ? sumResidenceExpenses(
            await Expense.findAllForOwner(filters.owner_id, range),
            filters.residence_id,
            unitIds
          )
        : expenseSummary.total

    // Seuls les jours tombant dans la fenêtre comptent : un séjour à cheval
    // sur la borne imputait auparavant ses jours entiers à la période, d'où
    // des taux d'occupation supérieurs à 100 % plafonnés artificiellement.
    //
    // La pondération par type de séjour suit : une demi-journée n'immobilise
    // pas le bien autant qu'un séjour complet, et la compter pour un jour
    // entier gonflerait le taux.
    const totalDays = bookings.reduce(
      (sum, b) =>
        sum +
        stayTypeOccupancyDays(
          b.stay_type ?? 'full_day',
          daysWithinWindow(b.start_date, b.end_date, range.from, range.to)
        ),
      0
    )

    // Une résidence demandée mais introuvable rendrait un relevé vide
    // indistinguable d’une résidence sans activité : le use case tranche.
    if (filters.residence_id && !residence) {
      return null
    }

    return {
      summary: {
        ca_brut: caBrut,
        depenses,
        // Peut être négatif : un mois de travaux sans réservation est une perte,
        // et la masquer à zéro tromperait le propriétaire.
        benefice_net: caBrut - depenses,
        // `published + rented` : un bien réservé passe en « rented » et sort
        // des publiés, alors qu'il fait toujours partie du parc exploité.
        taux_occupation: this.occupancyRate(
          totalDays,
          // Restreint à une résidence, la capacité est celle de ses unités.
          // Garder le parc entier au dénominateur écraserait le taux d’une
          // résidence de trois studios chez un propriétaire qui en a trente.
          unitIds ? unitIds.size : propertyStats.published + propertyStats.rented,
          range
        ),
        reservations: bookings.length,
        moyen_sejour: bookings.length ? totalDays / bookings.length : 0,
      },
      revenue_points: aggregateRevenuePoints(bookings, range),
    }
  }

  /**
   * Part des jours-bien occupés sur la période.
   *
   * Rapport entre les jours réservés et la capacité — le nombre de biens
   * publiés multiplié par la durée de la fenêtre. Sans bien publié ou sans
   * fenêtre bornée, le taux n'a pas de dénominateur et vaut zéro plutôt que
   * l'infini.
   */
  private occupancyRate(
    occupiedDays: number,
    exploitedProperties: number,
    range: { from?: Date; to?: Date }
  ): number {
    if (!exploitedProperties || !range.from || !range.to) return 0

    const windowDays = Math.max(
      1,
      Math.ceil((range.to.getTime() - range.from.getTime()) / MILLISECONDS_PER_DAY)
    )
    const capacity = windowDays * exploitedProperties
    if (capacity <= 0) return 0

    // Plafonné à 1 : des séjours débordant la fenêtre pourraient sinon donner
    // un taux supérieur à 100 %.
    return Math.min(1, occupiedDays / capacity)
  }
}

export default FinanceRepository
