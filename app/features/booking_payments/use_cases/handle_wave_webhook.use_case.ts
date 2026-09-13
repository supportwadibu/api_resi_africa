import { DomainError } from '#utils/domain_error'

import type { BookingPaymentStatus } from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'

export class HandleWaveWebhookUseCase {
  constructor(private paymentRepo: BookingPaymentRepository = new BookingPaymentRepository()) {}

  async execute(payload: Record<string, any>) {
    const checkoutId = this.extractCheckoutId(payload)
    if (!checkoutId) {
      throw new DomainError('invalid_wave_webhook', 'Webhook Wave invalide.', 422)
    }

    const payment = await this.paymentRepo.findByProviderCheckoutId(checkoutId)
    if (!payment) {
      throw new DomainError('payment_not_found', 'Paiement introuvable.', 404)
    }

    if (payment.status !== 'pending') {
      return payment
    }

    const status = this.mapWaveStatus(payload)
    const now = new Date()
    const data = {
      provider_transaction_id: this.extractTransactionId(payload),
      callback_event_id: this.extractEventId(payload),
      provider_payload: payload,
      ...(status === 'success' ? { paid_at: now } : {}),
      ...(status === 'failed' ? { failure_reason: this.extractFailureReason(payload) } : {}),
      ...(status === 'cancelled' ? { cancelled_at: now } : {}),
      ...(status === 'expired' ? { expired_at: now } : {}),
    }

    return this.paymentRepo.updateStatus(payment.id, status, data)
  }

  private extractCheckoutId(payload: Record<string, any>): string | null {
    return (
      String(
        payload.checkout_session_id ??
          payload.checkout_id ??
          payload.id ??
          payload.data?.checkout_session_id ??
          payload.data?.id ??
          ''
      ) || null
    )
  }

  private extractTransactionId(payload: Record<string, any>): string | null {
    const value = payload.transaction_id ?? payload.data?.transaction_id ?? payload.payment?.id
    return value ? String(value) : null
  }

  private extractEventId(payload: Record<string, any>): string | null {
    const value = payload.event_id ?? payload.id_event ?? payload.event?.id
    return value ? String(value) : null
  }

  private extractFailureReason(payload: Record<string, any>): string | null {
    const value = payload.failure_reason ?? payload.error ?? payload.data?.failure_reason
    return value ? String(value) : null
  }

  private mapWaveStatus(payload: Record<string, any>): BookingPaymentStatus {
    const rawStatus = String(
      payload.status ?? payload.data?.status ?? payload.payment_status ?? ''
    ).toLowerCase()
    const eventType = String(payload.type ?? payload.event_type ?? '').toLowerCase()

    if (['succeeded', 'success', 'paid', 'complete', 'completed'].includes(rawStatus)) {
      return 'success'
    }
    if (['failed', 'failure'].includes(rawStatus)) return 'failed'
    if (['cancelled', 'canceled'].includes(rawStatus)) return 'cancelled'
    if (['expired'].includes(rawStatus)) return 'expired'
    if (eventType.includes('completed') || eventType.includes('succeeded')) return 'success'
    if (eventType.includes('failed')) return 'failed'
    if (eventType.includes('cancel')) return 'cancelled'
    if (eventType.includes('expired')) return 'expired'

    return 'pending'
  }
}

export default HandleWaveWebhookUseCase
