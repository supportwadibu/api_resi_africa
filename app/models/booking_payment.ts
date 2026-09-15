import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

const BOOKING_PAYMENT_STATUSES = ['pending', 'success', 'failed', 'cancelled', 'expired'] as const
const BOOKING_PAYMENT_PROVIDERS = ['wave'] as const

export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number]
export type BookingPaymentProvider = (typeof BOOKING_PAYMENT_PROVIDERS)[number]

export interface BookingPaymentDocument {
  booking_id: string
  client_id: string
  owner_id: string
  property_id: string

  amount: number
  currency: string
  provider: BookingPaymentProvider
  status: BookingPaymentStatus

  /** Référence unique côté application — sert aussi d'identifiant de document. */
  transaction_reference: string
  provider_checkout_id: string | null
  provider_transaction_id: string | null
  payment_url: string | null

  callback_event_id: string | null
  failure_reason: string | null
  paid_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null

  metadata: Record<string, unknown>
  provider_payload: Record<string, unknown>

  created_at: Date
  updated_at: Date
}

export type BookingPaymentRecord = WithId<BookingPaymentDocument>

function payments() {
  return collection<BookingPaymentDocument>(COLLECTIONS.bookingPayments)
}

/**
 * Paiements de réservation.
 *
 * **`transaction_reference` est l'identifiant du document.** Elle était déjà
 * unique côté Mongo ; en faire la clé rend la reprise sur callback fournisseur
 * directe et empêche structurellement le double enregistrement d'un même
 * paiement — un webhook rejoué écrase au lieu de dupliquer.
 */
const BookingPayment = {
  async findById(id: string): Promise<BookingPaymentRecord | null> {
    if (!id) return null
    return toDoc<BookingPaymentDocument>(await payments().doc(id).get())
  },

  /** Lecture par référence : accès direct, la référence étant la clé. */
  async findByReference(reference: string): Promise<BookingPaymentRecord | null> {
    return BookingPayment.findById(reference)
  },

  async create(input: {
    booking_id: string
    client_id: string
    owner_id: string
    property_id: string
    amount: number
    currency?: string
    provider?: BookingPaymentProvider
    transaction_reference: string
    provider_checkout_id?: string | null
    payment_url?: string | null
    metadata?: Record<string, unknown>
  }): Promise<BookingPaymentRecord> {
    const now = new Date()
    const payload: BookingPaymentDocument = {
      booking_id: input.booking_id,
      client_id: input.client_id,
      owner_id: input.owner_id,
      property_id: input.property_id,
      amount: input.amount,
      currency: (input.currency ?? 'XOF').toUpperCase(),
      provider: input.provider ?? 'wave',
      status: 'pending',
      transaction_reference: input.transaction_reference,
      provider_checkout_id: input.provider_checkout_id ?? null,
      provider_transaction_id: null,
      payment_url: input.payment_url ?? null,
      callback_event_id: null,
      failure_reason: null,
      paid_at: null,
      cancelled_at: null,
      expired_at: null,
      metadata: input.metadata ?? {},
      provider_payload: {},
      created_at: now,
      updated_at: now,
    }

    await payments()
      .doc(input.transaction_reference)
      .set(toPayload(payload) as unknown as BookingPaymentDocument)

    return { ...payload, _id: input.transaction_reference }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<BookingPaymentDocument>
  ): Promise<BookingPaymentRecord | null> {
    const docRef = payments().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return null

    await docRef.update(toPayload({ ...patch, updated_at: new Date() }))
    return BookingPayment.findById(id)
  },

  /** Paiement associé à un identifiant de checkout fournisseur. */
  async findByCheckoutId(checkoutId: string): Promise<BookingPaymentRecord | null> {
    const snapshot = await payments().where('provider_checkout_id', '==', checkoutId).limit(1).get()

    return snapshot.empty ? null : toDoc<BookingPaymentDocument>(snapshot.docs[0])
  },

  async findByBooking(
    bookingId: string,
    status?: BookingPaymentStatus
  ): Promise<BookingPaymentRecord[]> {
    let query = payments().where('booking_id', '==', bookingId)
    if (status) query = query.where('status', '==', status)

    const snapshot = await query.get()
    return toDocs<BookingPaymentDocument>(snapshot.docs)
  },

  /**
   * Paiements d'un propriétaire sur une fenêtre, pour l'encaissé d'un rapport.
   *
   * Filtré sur `paid_at` et non `created_at` : un paiement initié en fin de
   * période mais confirmé après appartient à la période où l'argent est
   * effectivement arrivé. Deux égalités (`owner_id`, `status`) et une
   * inégalité sur un troisième champ n'ont besoin d'aucun index composite au-delà
   * de ceux déjà déclarés pour `booking_id`/`status`, Firestore indexant chaque
   * champ simple par défaut.
   */
  async findSettledByOwner(
    ownerId: string,
    range: { from?: Date; to?: Date } = {}
  ): Promise<BookingPaymentRecord[]> {
    let query = payments().where('owner_id', '==', ownerId).where('status', '==', 'success')

    if (range.from) query = query.where('paid_at', '>=', range.from)
    if (range.to) query = query.where('paid_at', '<', range.to)

    const snapshot = await query.get()
    return toDocs<BookingPaymentDocument>(snapshot.docs)
  },

  async paginateByClient(
    clientId: string,
    options: { limit: number; offset: number }
  ): Promise<{ data: BookingPaymentRecord[]; total: number }> {
    const base = payments().where('client_id', '==', clientId)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<BookingPaymentDocument>(snapshot.docs), total }
  },
}

export default BookingPayment
export { BOOKING_PAYMENT_PROVIDERS, BOOKING_PAYMENT_STATUSES }
