import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'

/**
 * Règle de résiliation d'un abonnement payant, sans Firestore : testée seule.
 *
 * Décidée avec le métier (octobre 2026), elle remplace le remboursement au
 * prorata, qui laissait partir le propriétaire à tout moment sans rien perdre :
 *
 * - **7 premiers jours** : tout est rendu, quel que soit le forfait — le
 *   temps d'essayer sans risque ;
 * - **8ᵉ au 14ᵉ jour, Pro+** : 3 000 F rendus, et 2 000 F gardés en crédit
 *   bloqué, qui ne sert qu'à payer un nouvel abonnement — un Pro ne coûte
 *   alors plus que 1 000 F. Le propriétaire qui part garde une raison de
 *   revenir ;
 * - **au-delà, ou Pro après 7 jours** : rien n'est rendu, et l'abonnement
 *   court jusqu'à son échéance — couper un accès qu'on ne rembourse pas
 *   reviendrait à le reprendre sans contrepartie.
 *
 * Limiter l'offre Pro+ à la deuxième semaine ferme une faille : sans borne,
 * un Pro+ utilisé 29 jours puis résilié revenait à 2 000 F le mois, moins
 * cher que Pro.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Jours pendant lesquels tout est rendu. */
export const FULL_REFUND_DAYS = 7

/** Fin de la fenêtre où un Pro+ résilié est rendu en partie. */
export const PARTIAL_REFUND_DAYS = 14

/** Part d'un Pro+ résilié en deuxième semaine, gardée en crédit bloqué. */
export const LATE_CANCEL_CREDIT = 2000

/**
 * Durée de validité du crédit. Sans échéance, RESI devrait indéfiniment un
 * crédit que le propriétaire n'utilisera peut-être jamais.
 */
export const CREDIT_VALIDITY_DAYS = 90

/**
 * Frais Wave d'un paiement d'abonnement, à la charge du propriétaire.
 * Annoncés avant le paiement, jamais rendus : Wave les garde.
 */
export const WAVE_FEE_RATE = 0.01

export type CancellationMode = 'full_refund' | 'partial_refund' | 'period_end'

export interface CancellationTerms {
  mode: CancellationMode
  /** Rendu au portefeuille, sans frais de retrait. */
  refund: number
  /** Gardé en crédit bloqué, valable `CREDIT_VALIDITY_DAYS` jours. */
  credit: number
  /** L'abonnement s'arrête aussitôt ; sinon il court jusqu'à l'échéance. */
  immediate: boolean
}

export interface CancellableSubscription {
  plan_tier?: PlanTier | null
  /** Montant versé par Wave, frais exclus. */
  amount: number
  /** Date du paiement de la période en cours : renouvellements compris. */
  start_date: Date
  /**
   * Crédit d'abonnement consommé au paiement. Absent sur l'historique et sur
   * les paiements sans crédit : 0.
   */
  credit_applied?: number | null
}

/**
 * `fullRefundAvailable` : le propriétaire n'a pas encore eu de remboursement
 * intégral. Il n'y a droit qu'une fois : sans cette borne, souscrire puis
 * résilier tous les six jours donnerait un abonnement gratuit sans fin. Une
 * fois ce droit consommé, les règles suivantes valent dès le premier jour.
 */
export function cancellationTerms(
  subscription: CancellableSubscription,
  now: Date = new Date(),
  { fullRefundAvailable = true }: { fullRefundAvailable?: boolean } = {}
): CancellationTerms {
  const elapsedMs = now.getTime() - subscription.start_date.getTime()
  const paid = Math.max(0, Math.floor(Number(subscription.amount)))
  const creditApplied = Math.max(0, Math.floor(subscription.credit_applied ?? 0))

  // Ce qui a été payé en crédit revient en crédit : le rendre en espèces
  // permettrait de changer un crédit bloqué en argent retirable.
  if (fullRefundAvailable && elapsedMs < FULL_REFUND_DAYS * DAY_MS) {
    return { mode: 'full_refund', refund: paid, credit: creditApplied, immediate: true }
  }

  if (
    readPlanTier(subscription.plan_tier) === 'pro_plus' &&
    elapsedMs < PARTIAL_REFUND_DAYS * DAY_MS
  ) {
    // Le crédit est pris sur les espèces versées, jamais ajouté par-dessus :
    // un Pro+ payé en partie avec un crédit ne doit rien rendre de plus que
    // ce qu'il a coûté en espèces.
    const credit = Math.min(LATE_CANCEL_CREDIT, paid)
    return { mode: 'partial_refund', refund: paid - credit, credit, immediate: true }
  }

  return { mode: 'period_end', refund: 0, credit: 0, immediate: false }
}

export function creditExpiry(from: Date): Date {
  return new Date(from.getTime() + CREDIT_VALIDITY_DAYS * DAY_MS)
}

/** Montant encore utilisable d'un crédit, 0 s'il est absent ou échu. */
export function usableCredit(
  credit: { amount: number; expires_at: Date } | null,
  now: Date = new Date()
): number {
  if (!credit || credit.expires_at.getTime() <= now.getTime()) return 0
  return Math.max(0, Math.floor(credit.amount))
}

/** Frais Wave, au franc supérieur : le franc CFA n'a pas de subdivision. */
export function waveFeeFor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.ceil(amount * WAVE_FEE_RATE)
}
