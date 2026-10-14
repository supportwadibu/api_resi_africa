import WavePaymentService from '#services/wave_payment_service'
import env from '#start/env'
import { DomainError } from '#utils/domain_error'
import crypto from 'node:crypto'

import BookingRepository from '../../bookings/repositories/booking_repository.ts'
import type { InitializeBookingPaymentOutput } from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'

export class InitializeBookingPaymentUseCase {
  constructor(
    private bookingRepo: BookingRepository = new BookingRepository(),
    private paymentRepo: BookingPaymentRepository = new BookingPaymentRepository(),
    private waveService: WavePaymentService = new WavePaymentService()
  ) {}

  async execute(bookingId: string, clientId: string): Promise<InitializeBookingPaymentOutput> {
    const booking = await this.bookingRepo.findById(bookingId)
    if (!booking || booking.client_id !== clientId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    if (booking.status !== 'confirmed') {
      throw new DomainError('booking_not_payable', 'Cette réservation ne peut pas être payée.', 409)
    }

    if (booking.total_amount <= 0) {
      throw new DomainError('invalid_payment_amount', 'Le montant de paiement est invalide.', 422)
    }

    // Une réservation déjà payée ne rouvre pas de session : « Réessayer » après
    // un paiement constaté ailleurs (webhook, page de retour) encaisserait deux
    // fois.
    const latest = await this.paymentRepo.findLatestByBooking(booking.id)
    if (latest?.status === 'success') {
      throw new DomainError('booking_already_paid', 'Cette réservation est déjà payée.', 409)
    }

    const existing = await this.paymentRepo.findPendingByBooking(booking.id)
    if (existing?.payment_url) {
      return { payment: existing, payment_url: existing.payment_url }
    }

    const currency = env.get('WAVE_CURRENCY') ?? 'XOF'
    const appUrl = env.get('APP_URL')
    const transactionReference = `BOOKING-${booking.id}-${crypto.randomUUID()}`
    // Page servie par l'API : les anciennes URL pointaient vers des routes
    // inexistantes, et le client tombait sur une 404 après avoir payé.
    const returnUrl = `${appUrl}/api/v1/payments/wave/bookings/${booking.id}/return`

    const checkout = await this.waveService.createCheckoutSession({
      amount: booking.total_amount,
      currency,
      transactionReference,
      successUrl: `${returnUrl}?outcome=success`,
      errorUrl: `${returnUrl}?outcome=error`,
      metadata: {
        booking_id: booking.id,
        client_id: booking.client_id,
        owner_id: booking.owner_id,
        property_id: booking.property_id,
      },
    })

    const payment = await this.paymentRepo.create({
      booking_id: booking.id,
      client_id: booking.client_id,
      owner_id: booking.owner_id,
      property_id: booking.property_id,
      amount: booking.total_amount,
      currency,
      transaction_reference: transactionReference,
      provider_checkout_id: checkout.id,
      payment_url: checkout.paymentUrl,
      metadata: {
        booking_id: booking.id,
      },
      provider_payload: checkout.raw,
    })

    return { payment, payment_url: checkout.paymentUrl }
  }
}

export default InitializeBookingPaymentUseCase
