import Expense from '#models/expense'

import type { Referrer } from './referrer.ts'

/** Ce que le reflet d'une commission lit de la réservation. */
export interface CommissionBooking {
  _id: string
  owner_id: string
  property_id: string
  residence_id?: string | null
  status: string
  created_at: Date
  referrer?: Referrer | null
  referrer_commission_amount?: number
}

/**
 * Montant que le reflet doit porter : zéro pour une réservation annulée ou
 * sans apporteur, le reflet étant alors retiré.
 */
export function mirroredCommissionAmount(booking: CommissionBooking): number {
  if (booking.status === 'cancelled' || !booking.referrer) return 0
  return booking.referrer_commission_amount ?? 0
}

/**
 * Aligne la dépense `commission` d'une réservation sur sa commission.
 *
 * Cette dépense est la commission telle que le relevé financier la déduit :
 * datée de l'enregistrement, au montant figé ce jour-là. Elle est créée à
 * l'enregistrement et retirée à l'annulation ; entre les deux, le montant ne
 * bouge plus.
 *
 * Rejouée après chaque action sur la réservation : sans effet quand la dépense
 * est en place, elle crée celle d'une réservation antérieure à son
 * introduction. `node ace commissions:sync` en fait autant pour tout
 * l'historique.
 *
 * Clé dérivée de l'identifiant de la réservation : un rejeu de la création
 * hors ligne rend la même réservation, donc le même reflet.
 */
export async function syncReferrerCommissionExpense(booking: CommissionBooking): Promise<void> {
  // L'apporteur se saisit à la création et ne se retire pas : sans lui, aucun
  // reflet n'a jamais été écrit, et la lecture serait un aller-retour perdu
  // sur chaque séjour.
  if (!booking.referrer) return

  const requestId = `commission:${booking._id}`
  const amount = mirroredCommissionAmount(booking)
  const existing = await Expense.findByRequestId(booking.owner_id, requestId)

  if (amount <= 0) {
    if (existing) await Expense.deleteOne(existing._id, booking.owner_id)
    return
  }

  if (existing) {
    if (existing.amount !== amount) {
      await Expense.findByIdAndUpdate(existing._id, { amount }, booking.owner_id)
    }
    return
  }

  await Expense.createOnce({
    owner_id: booking.owner_id,
    property_id: booking.property_id,
    residence_id: booking.residence_id ?? null,
    category: 'commission',
    amount,
    spent_at: booking.created_at,
    note: `Commission apporteur : ${booking.referrer!.name}`,
    client_request_id: requestId,
  })
}
