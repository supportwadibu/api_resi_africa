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
 * Aligne la dépense `commission` d'une réservation sur sa commission du moment.
 *
 * La réservation est la source : c'est elle que le relevé financier lit, et
 * elle seule est recalculée à la prolongation, au départ anticipé ou à la
 * modification. La dépense n'en est que le reflet dans la liste des dépenses ;
 * sans cet alignement, elle gardait le montant de la création, et survivait à
 * l'annulation.
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
