import logger from '@adonisjs/core/services/logger'

import BookingRepository from '#features/bookings/repositories/booking_repository'
import { isPaymentConsistent } from '#features/subscriptions/subscription_checkout'
import WaveSubscriptionService from '#services/wave_subscription_service'
import { DomainError } from '#utils/domain_error'

import type { BookingPaymentDto } from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'

/**
 * Constate l'issue du paiement Wave d'une réservation, sans attendre le
 * webhook.
 *
 * Appelé par l'app client à son retour au premier plan et par la page de
 * retour de Wave. La session est **relue chez Wave**, seule source qui fasse
 * foi : rien de ce que le client envoie n'est cru.
 *
 * `WaveSubscriptionService` sert ici malgré son nom : sa lecture de session
 * est générique et utilise la même clé `WAVE_API_KEY`.
 */
export class ConfirmBookingPaymentUseCase {
  constructor(
    private bookingRepo: Pick<BookingRepository, 'findById'> = new BookingRepository(),
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findLatestByBooking' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<
      WaveSubscriptionService,
      'getCheckoutSession'
    > = new WaveSubscriptionService()
  ) {}

  async execute(bookingId: string, clientId: string): Promise<BookingPaymentDto> {
    const booking = await this.bookingRepo.findById(bookingId)
    // Même réponse pour une réservation inconnue et pour celle d'un autre.
    if (!booking || booking.client_id !== clientId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const payment = await this.executeForBooking(bookingId)
    if (!payment) throw new DomainError('payment_not_found', 'Paiement introuvable.', 404)
    return payment
  }

  /**
   * Page de retour de Wave : pas de session, la réservation suffit.
   *
   * Idempotent : un paiement qui n'est plus `pending` est rendu tel quel. Le
   * plus souvent le webhook ou la page de retour l'ont déjà constaté quand le
   * client revient dans l'app.
   */
  async executeForBooking(bookingId: string): Promise<BookingPaymentDto | null> {
    const payment = await this.paymentRepo.findLatestByBooking(bookingId)
    if (!payment || payment.status !== 'pending' || !payment.provider_checkout_id) {
      return payment
    }

    const session = await this.readSession(payment.provider_checkout_id)
    // Session inconnue de Wave : on ne clôt rien, une réponse erronée de Wave
    // ne doit pas effacer un paiement.
    if (!session) return payment

    const now = new Date()

    if (session.payment_status === 'succeeded') {
      const consistent = isPaymentConsistent(
        { _id: payment.transaction_reference, amount: payment.amount, currency: payment.currency },
        session
      )
      if (!consistent) {
        logger.warn({ booking: bookingId, session: session.id }, 'Paiement Wave divergent')
        return (
          (await this.paymentRepo.updateStatus(payment.id, 'failed', {
            failure_reason: 'amount_mismatch',
          })) ?? payment
        )
      }

      return (
        (await this.paymentRepo.updateStatus(payment.id, 'success', {
          provider_transaction_id: session.transaction_id,
          paid_at: now,
        })) ?? payment
      )
    }

    if (session.checkout_status === 'expired' || session.payment_status === 'cancelled') {
      return (
        (await this.paymentRepo.updateStatus(payment.id, 'expired', { expired_at: now })) ?? payment
      )
    }

    // `open` / `processing` : le client n'a pas encore payé.
    return payment
  }

  private async readSession(checkoutId: string) {
    try {
      return await this.wave.getCheckoutSession(checkoutId)
    } catch (error) {
      logger.error({ err: error, checkoutId }, 'Lecture de la session Wave impossible')
      throw new DomainError(
        'payment_provider_unavailable',
        'Wave est momentanément injoignable. Réessayez dans un instant.',
        502
      )
    }
  }
}

export default ConfirmBookingPaymentUseCase
