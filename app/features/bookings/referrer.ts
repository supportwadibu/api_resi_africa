import { normalizePhone } from '#models/client'

/**
 * Apporteur d'affaire : la personne qui amène un client et touche une
 * commission sur son séjour.
 *
 * Saisie libre sur la réservation, sans compte ni carnet : l'apporteur n'est
 * souvent connu que de nom — un employé de la résidence, un chauffeur, une
 * connaissance.
 */
export interface Referrer {
  name: string
  phone: string | null
}

/**
 * Taux appliqué aux nouvelles réservations. Figé sur chaque réservation à sa
 * création : le changer ne réécrit pas les commissions déjà dues.
 */
export const REFERRER_COMMISSION_RATE = 0.1

/** Commission sur un montant, arrondie au franc — le franc CFA n'a pas de subdivision. */
export function computeReferrerCommission(totalAmount: number, rate: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || rate <= 0) return 0
  return Math.round(totalAmount * rate)
}

/** Champs d'apporteur d'une réservation neuve. Vide sans apporteur. */
export function buildReferrerFields(
  referrer: { name: string; phone?: string | null } | null | undefined,
  totalAmount: number
): {
  referrer?: Referrer
  referrer_commission_rate?: number
  referrer_commission_amount?: number
} {
  const name = referrer?.name.trim()
  if (!name) return {}

  const phone = referrer?.phone?.trim()
  return {
    referrer: { name, phone: phone ? normalizePhone(phone) : null },
    referrer_commission_rate: REFERRER_COMMISSION_RATE,
    referrer_commission_amount: computeReferrerCommission(totalAmount, REFERRER_COMMISSION_RATE),
  }
}

/**
 * Réaligne la commission sur un montant de séjour qui change.
 *
 * La commission suit ce que le client a réellement payé : une prolongation
 * l'augmente, un départ anticipé la réduit. Le taux reste celui figé à la
 * création. Le patch est rendu inchangé si la réservation n'a pas d'apporteur
 * ou si le montant ne bouge pas.
 */
export function withReferrerCommission<T extends Record<string, unknown>>(
  booking: { referrer?: Referrer | null; referrer_commission_rate?: number },
  patch: T
): T & { referrer_commission_amount?: number } {
  const rate = booking.referrer_commission_rate
  if (!booking.referrer || !rate || typeof patch.total_amount !== 'number') return patch

  return {
    ...patch,
    referrer_commission_amount: computeReferrerCommission(patch.total_amount, rate),
  }
}
