import logger from '@adonisjs/core/services/logger'

import BookingRepository from '#features/bookings/repositories/booking_repository'
import { CreditBookingPaymentUseCase } from '#features/wallets/use_cases/index'
import { isPaymentConsistent } from '#features/subscriptions/subscription_checkout'
import WaveClient, { isSessionPayable, toPaymentDomainError } from '#services/wave_client'
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
 */
export class ConfirmBookingPaymentUseCase {
  constructor(
    private bookingRepo: Pick<BookingRepository, 'findById'> = new BookingRepository(),
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findLatestByBooking' | 'findByProviderCheckoutId' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<WaveClient, 'getCheckoutSession'> = new WaveClient(),
    private credit: Pick<CreditBookingPaymentUseCase, 'execute'> = new CreditBookingPaymentUseCase()
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
    return payment ? this.confirm(payment) : null
  }

  /**
   * Webhook Wave : le corps n'a désigné que la session, relue ici chez Wave.
   * `null` si la session n'est pas celle d'une réservation.
   */
  async executeForCheckout(checkoutId: string): Promise<BookingPaymentDto | null> {
    const payment = await this.paymentRepo.findByProviderCheckoutId(checkoutId)
    return payment ? this.confirm(payment) : null
  }

  private async confirm(payment: BookingPaymentDto): Promise<BookingPaymentDto> {
    if (payment.status !== 'pending' || !payment.provider_checkout_id) return payment

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
        logger.warn({ booking: payment.booking_id, session: session.id }, 'Paiement Wave divergent')
        // La transaction est gardée : c'est elle qu'il faudra rembourser.
        return (
          (await this.paymentRepo.updateStatus(payment.id, 'failed', {
            failure_reason: 'amount_mismatch',
            provider_transaction_id: session.transaction_id,
          })) ?? payment
        )
      }

      const paid =
        (await this.paymentRepo.updateStatus(payment.id, 'success', {
          provider_transaction_id: session.transaction_id,
          paid_at: now,
        })) ?? payment

      // L'argent est chez RESI : il entre au portefeuille de la résidence,
      // d'où le propriétaire le retire. Idempotent, comme la confirmation.
      const booking = await this.bookingRepo.findById(payment.booking_id)
      await this.credit.execute({
        owner_id: payment.owner_id,
        residence_id: booking?.residence_id ?? null,
        booking_id: payment.booking_id,
        booking_payment_id: payment.id,
        amount: payment.amount,
      })

      return paid
    }

    // Raison du dernier refus — fonds insuffisants, compte bloqué —, gardée
    // pour dire au client pourquoi son paiement n'est pas passé.
    const failureReason = session.last_payment_error?.code ?? null

    // Échue chez Wave, ou ouverte mais au-delà de son `when_expires` : Wave
    // ne bascule pas toujours le statut à l'heure dite.
    const lapsed =
      session.checkout_status === 'expired' ||
      (session.checkout_status === 'open' && !isSessionPayable(session, now))

    if (lapsed) {
      return (
        (await this.paymentRepo.updateStatus(payment.id, 'expired', {
          expired_at: now,
          failure_reason: failureReason,
        })) ?? payment
      )
    }

    if (session.payment_status === 'cancelled') {
      // Session close sur un refus : le paiement est perdu. Encore ouverte,
      // le client peut réessayer sur la même session — le paiement reste en
      // attente, et une tentative réussie ensuite sera constatée.
      if (session.checkout_status === 'complete') {
        return (
          (await this.paymentRepo.updateStatus(payment.id, 'cancelled', {
            cancelled_at: now,
            failure_reason: failureReason,
          })) ?? payment
        )
      }
      return (
        (await this.paymentRepo.updateStatus(payment.id, 'pending', {
          failure_reason: failureReason,
        })) ?? payment
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
      throw toPaymentDomainError(error)
    }
  }
}

export default ConfirmBookingPaymentUseCase
