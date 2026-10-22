import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import WaveClient, { isSessionPayable, toPaymentDomainError } from '#services/wave_client'
import env from '#start/env'
import { DomainError } from '#utils/domain_error'

import BookingRepository from '../../bookings/repositories/booking_repository.ts'
import type {
  BookingPaymentDto,
  InitializeBookingPaymentOutput,
} from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'
import ConfirmBookingPaymentUseCase from './confirm_booking_payment.use_case.ts'

/**
 * Ouvre — ou rouvre — le paiement Wave d'une réservation en ligne.
 *
 * Un paiement en attente n'est repris que si sa session Wave peut encore être
 * payée : une session expire 30 minutes après sa création, et rendre son lien
 * au client le menait à une page morte.
 */
export class InitializeBookingPaymentUseCase {
  constructor(
    private bookingRepo: Pick<BookingRepository, 'findById'> = new BookingRepository(),
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findLatestByBooking' | 'findPendingByBooking' | 'create' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<
      WaveClient,
      'createCheckoutSession' | 'getCheckoutSession' | 'expireCheckoutSession'
    > = new WaveClient(),
    private confirmation: Pick<
      ConfirmBookingPaymentUseCase,
      'executeForBooking'
    > = new ConfirmBookingPaymentUseCase()
  ) {}

  async execute(bookingId: string, clientId: string): Promise<InitializeBookingPaymentOutput> {
    const booking = await this.bookingRepo.findById(bookingId)
    if (!booking || booking.client_id !== clientId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    if (booking.status !== 'confirmed') {
      throw new DomainError('booking_not_payable', 'Cette réservation ne peut pas être payée.', 409)
    }

    // Wave refuse les décimales en XOF : un montant qui en porterait serait
    // rejeté, et mieux vaut le dire ici qu'en 502.
    if (!Number.isInteger(booking.total_amount) || booking.total_amount <= 0) {
      throw new DomainError('invalid_payment_amount', 'Le montant de paiement est invalide.', 422)
    }

    // Une réservation déjà payée ne rouvre pas de session : « Réessayer » après
    // un paiement constaté ailleurs (webhook, page de retour) encaisserait deux
    // fois.
    const latest = await this.paymentRepo.findLatestByBooking(booking.id)
    if (latest?.status === 'success') {
      throw new DomainError('booking_already_paid', 'Cette réservation est déjà payée.', 409)
    }

    const reusable = await this.reusablePending(booking.id)
    if (reusable) return reusable

    const currency = (env.get('WAVE_CURRENCY') ?? 'XOF').toUpperCase()
    const appUrl = env.get('APP_URL')
    const transactionReference = `BOOKING-${booking.id}-${crypto.randomUUID()}`
    // Page servie par l'API : les anciennes URL pointaient vers des routes
    // inexistantes, et le client tombait sur une 404 après avoir payé.
    const returnUrl = `${appUrl}/api/v1/payments/wave/bookings/${booking.id}/return`

    let session
    try {
      session = await this.wave.createCheckoutSession({
        amount: booking.total_amount,
        currency,
        clientReference: transactionReference,
        successUrl: `${returnUrl}?outcome=success`,
        errorUrl: `${returnUrl}?outcome=error`,
      })
    } catch (error) {
      logger.error({ err: error, booking: booking.id }, 'Création de la session Wave impossible')
      throw toPaymentDomainError(error)
    }

    // Garanti non nul par le client : une session sans lien est refusée.
    const paymentUrl = session.wave_launch_url!
    const payment = await this.paymentRepo.create({
      booking_id: booking.id,
      client_id: booking.client_id,
      owner_id: booking.owner_id,
      property_id: booking.property_id,
      amount: booking.total_amount,
      currency,
      transaction_reference: transactionReference,
      provider_checkout_id: session.id,
      payment_url: paymentUrl,
      metadata: { booking_id: booking.id },
    })

    return { payment, payment_url: paymentUrl }
  }

  /**
   * Paiement en attente dont la session peut encore être payée, ou `null`.
   *
   * Une session close est d'abord constatée : payée entre-temps, elle confirme
   * la réservation — rouvrir un paiement ferait payer deux fois. Échue, son
   * paiement est clos pour laisser place à une nouvelle session.
   */
  private async reusablePending(bookingId: string): Promise<InitializeBookingPaymentOutput | null> {
    const pending = await this.paymentRepo.findPendingByBooking(bookingId)
    if (!pending?.payment_url || !pending.provider_checkout_id) return null

    let session
    try {
      session = await this.wave.getCheckoutSession(pending.provider_checkout_id)
    } catch (error) {
      throw toPaymentDomainError(error)
    }

    if (session && isSessionPayable(session)) {
      return { payment: pending, payment_url: pending.payment_url }
    }

    const settled: BookingPaymentDto | null = await this.confirmation.executeForBooking(bookingId)
    if (settled?.status === 'success') {
      throw new DomainError('booking_already_paid', 'Cette réservation est déjà payée.', 409)
    }

    // Toujours en attente côté RESI alors que Wave ne l'accepte plus — session
    // inconnue, ou échue sans que Wave l'ait encore basculée : elle est fermée
    // chez Wave par précaution, et close ici.
    if (settled?.status === 'pending') {
      await this.wave.expireCheckoutSession(pending.provider_checkout_id).catch(() => false)
      await this.paymentRepo.updateStatus(pending.id, 'expired', { expired_at: new Date() })
    }

    return null
  }
}

export default InitializeBookingPaymentUseCase
