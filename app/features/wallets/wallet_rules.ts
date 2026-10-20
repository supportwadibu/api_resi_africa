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
}

/**
 * Chiffre un retrait et vérifie qu'il est possible.
 *
 * Le montant demandé est débité du portefeuille ; les frais en sont retranchés
 * pour donner ce que le propriétaire reçoit. Un retrait de 10 000 F lui verse
 * 9 900 F.
 */
export function quoteWithdrawal(amount: number, balance: number): WithdrawalAmounts {
  if (!Number.isInteger(amount) || amount < MINIMUM_WITHDRAWAL) {
    throw new DomainError(
      'withdrawal_amount_too_low',
      `Le retrait minimal est de ${MINIMUM_WITHDRAWAL} F.`,
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

  const fee = computeWithdrawalFee(amount)
  return { amount, fee, net_amount: amount - fee }
}
