import WaveClient, { toPaymentDomainError } from '#services/wave_client'

import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'
import ConfirmBookingPaymentUseCase from './confirm_booking_payment.use_case.ts'

/**
 * Ferme la session Wave encore ouverte d'une réservation qu'on annule.
 *
 * Restée ouverte, elle laissait le client payer une réservation annulée : la
 * confirmation créditait alors le portefeuille du propriétaire d'un séjour qui
 * n'aurait jamais lieu. Appelé par les deux annulations, **avant** de chercher
 * le paiement encaissé : une session payée à l'instant est ainsi constatée, et
 * l'annulation décide de son sort comme de tout paiement réussi.
 */
export class ClosePendingBookingPaymentUseCase {
  constructor(
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findAllPendingByBooking' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<WaveClient, 'expireCheckoutSession'> = new WaveClient(),
    private confirmation: Pick<
      ConfirmBookingPaymentUseCase,
      'executeForBooking'
    > = new ConfirmBookingPaymentUseCase()
  ) {}

  async execute(bookingId: string): Promise<void> {
    const pending = await this.paymentRepo.findAllPendingByBooking(bookingId)
    let refused = false

    for (const payment of pending) {
      if (!payment.provider_checkout_id) continue

      let closed: boolean
      try {
        closed = await this.wave.expireCheckoutSession(payment.provider_checkout_id)
      } catch (error) {
        // Wave injoignable : l'annulation échoue plutôt que de laisser derrière
        // elle une session payable.
        throw toPaymentDomainError(error)
      }

      if (closed) {
        await this.paymentRepo.updateStatus(payment.id, 'cancelled', { cancelled_at: new Date() })
      } else {
        refused = true
      }
    }

    // Refusée : payée à l'instant (409) ou inconnue de Wave (404). La
    // confirmation constate l'issue, sans rien écraser.
    if (refused) await this.confirmation.executeForBooking(bookingId)
  }
}

export default ClosePendingBookingPaymentUseCase
