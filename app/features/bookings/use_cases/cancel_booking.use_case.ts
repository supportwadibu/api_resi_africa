/* eslint-disable prettier/prettier */
import { ClosePendingBookingPaymentUseCase } from '#features/booking_payments/use_cases/close_pending_booking_payment.use_case'
import { RefundBookingPaymentUseCase } from '#features/booking_payments/use_cases/refund_booking_payment.use_case'
import { RestoreStayCreditUseCase } from '#features/sponsorships/use_cases/restore_stay_credit.use_case'
import { DomainError } from '#utils/domain_error'

import type { BookingDto, CancelBookingInput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Annulation par le client de sa réservation en ligne, avant le séjour.
 *
 * Un paiement en ligne est remboursé par Wave, intégralement : aucune règle
 * d'annulation ne permet aujourd'hui d'en retenir une part, et garder l'argent
 * d'un client qui annule sans le lui dire serait pire. Le remboursement
 * précède l'annulation : si Wave refuse, la réservation reste active.
 */
export class CancelBookingUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private refunds: RefundBookingPaymentUseCase = new RefundBookingPaymentUseCase(),
    private pendingPayments: ClosePendingBookingPaymentUseCase = new ClosePendingBookingPaymentUseCase(),
    private stayCredit: RestoreStayCreditUseCase = new RestoreStayCreditUseCase()
  ) {}

  async execute(
    id: string,
    client_id: string,
    input: CancelBookingInput = {}
  ): Promise<BookingDto> {
    const current = await this.repo.findById(id)
    if (!current || current.client_id !== client_id || current.status !== 'confirmed') {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Avant de chercher le paiement encaissé : voir `CancelOwnerBookingUseCase`.
    await this.pendingPayments.execute(id)

    const payment = await this.refunds.findPaid(id)
    const refunded = payment
      ? await this.refunds.execute(payment, {
          id: current.id,
          owner_id: current.owner_id,
          residence_id: current.residence_id ?? null,
        })
      : 0

    const booking = await this.repo.updateStatus(
      id,
      'cancelled',
      {
        cancelled_at: new Date(),
        cancellation_reason: input.reason ?? null,
        cancellation_deposit_action: refunded > 0 ? 'refund' : null,
        retained_amount: 0,
        cancellation_refunded_amount: refunded,
      },
      { client_id }
    )
    if (!booking) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }
    await this.repo.markPropertyAsAvailable(current.property_id)
    // Tout paiement est rendu à l'annulation par le client : le crédit
    // parrainage engagé l'est aussi, en crédit.
    await this.stayCredit.execute(current)
    return booking
  }
}

export default CancelBookingUseCase
