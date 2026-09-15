import BookingPayment, { type BookingPaymentRecord } from '#models/booking_payment'

import type { BookingPaymentDto, BookingPaymentStatus } from '../dto/booking_payment.dto.ts'

export class BookingPaymentRepository {
  static toDto(doc: BookingPaymentRecord): BookingPaymentDto {
    return {
      id: doc._id,
      booking_id: doc.booking_id,
      client_id: doc.client_id,
      owner_id: doc.owner_id,
      property_id: doc.property_id,
      amount: doc.amount,
      currency: doc.currency,
      provider: doc.provider,
      status: doc.status,
      transaction_reference: doc.transaction_reference,
      provider_checkout_id: doc.provider_checkout_id ?? null,
      provider_transaction_id: doc.provider_transaction_id ?? null,
      payment_url: doc.payment_url ?? null,
      callback_event_id: doc.callback_event_id ?? null,
      failure_reason: doc.failure_reason ?? null,
      paid_at: doc.paid_at ?? null,
      cancelled_at: doc.cancelled_at ?? null,
      expired_at: doc.expired_at ?? null,
      metadata: doc.metadata ?? {},
      provider_payload: doc.provider_payload ?? {},
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  /**
   * Dernier paiement en attente d'une réservation.
   *
   * Le tri par date se fait en mémoire : trier côté Firestore imposerait un
   * index composite pour une liste qui compte rarement plus d'un élément.
   */
  async findPendingByBooking(bookingId: string): Promise<BookingPaymentDto | null> {
    const pending = await BookingPayment.findByBooking(bookingId, 'pending')
    if (pending.length === 0) return null

    const latest = pending.sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]

    return BookingPaymentRepository.toDto(latest)
  }

  async create(input: {
    booking_id: string
    client_id: string
    owner_id: string
    property_id: string
    amount: number
    currency: string
    transaction_reference: string
    provider_checkout_id: string
    payment_url: string
    metadata?: Record<string, unknown>
    provider_payload?: Record<string, unknown>
  }): Promise<BookingPaymentDto> {
    const doc = await BookingPayment.create({
      booking_id: input.booking_id,
      client_id: input.client_id,
      owner_id: input.owner_id,
      property_id: input.property_id,
      amount: input.amount,
      currency: input.currency,
      provider: 'wave',
      transaction_reference: input.transaction_reference,
      provider_checkout_id: input.provider_checkout_id,
      payment_url: input.payment_url,
      metadata: input.metadata ?? {},
    })

    if (input.provider_payload) {
      const updated = await BookingPayment.findByIdAndUpdate(doc._id, {
        provider_payload: input.provider_payload,
      })
      if (updated) return BookingPaymentRepository.toDto(updated)
    }

    return BookingPaymentRepository.toDto(doc)
  }

  /**
   * Paiements encaissés (`success`) d'un propriétaire sur une période.
   *
   * Manquait au dépôt : jusqu'ici seules des recherches unitaires par
   * réservation ou par identifiant de checkout existaient. Le rapport
   * « réservations » a besoin d'un encaissé par séjour sur l'ensemble d'une
   * période — l'ajouter ici plutôt que de laisser un use case interroger
   * Firestore directement.
   */
  async findSettledByOwner(
    ownerId: string,
    range: { from?: Date; to?: Date } = {}
  ): Promise<BookingPaymentDto[]> {
    const docs = await BookingPayment.findSettledByOwner(ownerId, range)
    return docs.map((doc) => BookingPaymentRepository.toDto(doc))
  }

  async findByProviderCheckoutId(providerCheckoutId: string): Promise<BookingPaymentDto | null> {
    const doc = await BookingPayment.findByCheckoutId(providerCheckoutId)
    return doc ? BookingPaymentRepository.toDto(doc) : null
  }

  async updateStatus(
    id: string,
    status: BookingPaymentStatus,
    data: Record<string, unknown> = {}
  ): Promise<BookingPaymentDto | null> {
    const doc = await BookingPayment.findByIdAndUpdate(id, { ...data, status })
    return doc ? BookingPaymentRepository.toDto(doc) : null
  }
}

export default BookingPaymentRepository
