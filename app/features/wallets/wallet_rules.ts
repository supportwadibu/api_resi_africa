import { DomainError } from '#utils/domain_error'

/**
 * Règles d'argent du portefeuille, sans Firestore : testées seules.
 *
 * Le portefeuille garde l'argent que les clients ont payé par Wave pour une
 * résidence : Wave crédite le compte de RESI, et RESI le doit au propriétaire.
 * Le propriétaire le récupère par une demande de retrait, que l'équipe RESI
 * honore à la main (transfert Wave) puis marque payée.
 */

/** Frais de retrait : 1 %, à tous les paliers (offre RESI Basic). */
export const WITHDRAWAL_FEE_RATE = 0.01

/**
 * Retrait minimal, en francs. En deçà, les frais d'un transfert Wave manuel
 * coûtent à l'équipe plus que le service rendu.
 */
export const MINIMUM_WITHDRAWAL = 1000

/**
 * Portefeuille d'une résidence, ou portefeuille général du propriétaire pour
 * ses biens autonomes.
 *
 * Identifiant dérivé et non aléatoire : le crédit d'un paiement retrouve son
 * portefeuille sans requête, et deux crédits concurrents tombent sur le même
 * document — la transaction les ordonne.
 */
export function walletIdFor(ownerId: string, residenceId: string | null | undefined): string {
  return residenceId ? `residence_${residenceId}` : `owner_${ownerId}`
}

/**
 * Frais d'un retrait, arrondis au franc supérieur.
 *
 * Au franc supérieur et non au plus proche : le franc CFA n'a pas de
 * subdivision, et un arrondi au plus proche ferait payer à RESI le centime de
 * chaque petit retrait.
 */
export function computeWithdrawalFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.ceil(amount * WITHDRAWAL_FEE_RATE)
}

export interface WithdrawalAmounts {
  /** Montant débité du portefeuille. */
  amount: number
  fee: number
  /** Montant versé au propriétaire. */
  net_amount: number
  /** Part du montant retirée sans frais (remboursements d'abonnement). */
  fee_free_amount: number
}

/**
 * Chiffre un retrait et vérifie qu'il est possible.
 *
 * Le montant demandé est débité du portefeuille ; les frais en sont retranchés
 * pour donner ce que le propriétaire reçoit. Un retrait de 10 000 F lui verse
 * 9 900 F.
 *
 * La part du solde issue d'un remboursement d'abonnement (`feeFreeBalance`)
 * sort la première, sans frais : RESI rend là l'argent du propriétaire.
 */
export function quoteWithdrawal(
  amount: number,
  balance: number,
  feeFreeBalance: number = 0,
  minimum: number = MINIMUM_WITHDRAWAL
): WithdrawalAmounts {
  if (!Number.isInteger(amount) || amount < minimum) {
    throw new DomainError(
      'withdrawal_amount_too_low',
      `Le retrait minimal est de ${minimum} F.`,
      422
    )
  }

  if (amount > balance) {
    throw new DomainError(
      'insufficient_wallet_balance',
      `Solde insuffisant : ${balance} F disponibles.`,
      422
    )
  }

  const feeFreeAmount = Math.min(amount, Math.max(0, feeFreeBalance))
  const fee = computeWithdrawalFee(amount - feeFreeAmount)
  return { amount, fee, net_amount: amount - fee, fee_free_amount: feeFreeAmount }
}

/**
 * Numéros Wave qu'un propriétaire enregistre pour ses retraits : deux au
 * plus — le sien et, souvent, celui d'un associé ou d'un proche —, choisis à
 * chaque demande. Le versement ne passe que par Wave.
 */
export const MAX_PAYOUT_NUMBERS = 2

export interface PayoutNumber {
  /** Position affichée, 1 ou 2 : c'est elle que la demande désigne. */
  slot: number
  phone: string
  holder_name: string | null
}

/**
 * Chiffres seuls, `+` initial admis : de quoi couvrir un numéro ivoirien
 * (10 chiffres) avec ou sans indicatif, sans figer un format que Wave
 * pourrait élargir à d'autres pays.
 */
const PAYOUT_PHONE = /^\+?\d{8,15}$/

/**
 * Valide et met en forme les numéros saisis : espaces, tirets et points
 * retirés, nom du titulaire rogné, positions uniques et rangées.
 */
export function normalizePayoutNumbers(
  input: Array<{ slot: number; phone: string; holder_name?: string | null }>
): PayoutNumber[] {
  if (input.length > MAX_PAYOUT_NUMBERS) {
    throw new DomainError(
      'too_many_payout_numbers',
      `Vous pouvez enregistrer ${MAX_PAYOUT_NUMBERS} numéros Wave au plus.`,
      422
    )
  }

  const numbers = input.map((entry) => ({
    slot: entry.slot,
    phone: entry.phone.replace(/[\s\-.()]/g, ''),
    holder_name: entry.holder_name?.trim() || null,
  }))

  for (const number of numbers) {
    if (!Number.isInteger(number.slot) || number.slot < 1 || number.slot > MAX_PAYOUT_NUMBERS) {
      throw new DomainError('invalid_payout_slot', 'Position de numéro invalide.', 422)
    }
    if (!PAYOUT_PHONE.test(number.phone)) {
      throw new DomainError(
        'invalid_payout_phone',
        `Le numéro Wave ${number.phone} n'est pas valide.`,
        422
      )
    }
  }

  if (new Set(numbers.map((n) => n.slot)).size !== numbers.length) {
    throw new DomainError('duplicate_payout_slot', 'Deux numéros occupent la même position.', 422)
  }
  if (new Set(numbers.map((n) => n.phone)).size !== numbers.length) {
    throw new DomainError('duplicate_payout_phone', 'Ce numéro Wave est déjà enregistré.', 422)
  }

  return numbers.sort((a, b) => a.slot - b.slot)
}
