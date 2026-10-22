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
 *
 * La commission elle-même est figée à l'enregistrement, sur le montant
 * convenu ce jour-là : un départ anticipé, une prolongation ou une
 * modification ne la touchent pas. L'apporteur a amené un séjour de cinq jours
 * à 50 000 F, il touche 5 000 F même si le client part au bout de trois. Seule
 * l'annulation la retire (voir `mirroredCommissionAmount`).
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
