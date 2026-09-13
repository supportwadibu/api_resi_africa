import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

const PAYMENT_STATUSES = ['pending', 'success', 'failed', 'refunded'] as const
const PAYMENT_METHODS = ['mobile_money', 'card', 'bank_transfer'] as const
const PAYMENT_PROVIDERS = ['wave'] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

export interface PaymentHistoryDocument {
  user_id: string
  subscription_id: string
  amount: number
  currency: string
  payment_method: PaymentMethod
  provider: PaymentProvider
  status: PaymentStatus

  /** Référence unique côté application — sert aussi d'identifiant de document. */
  transaction_reference: string
  provider_transaction_id: string | null

  failure_reason: string | null
  paid_at: Date | null
  refunded_at: Date | null
  refund_reason: string | null

  metadata: Record<string, unknown>

  created_at: Date
  updated_at: Date
}

export type PaymentHistoryRecord = WithId<PaymentHistoryDocument>

function paymentHistories() {
  return collection<PaymentHistoryDocument>(COLLECTIONS.paymentHistories)
}

/**
 * Historique des paiements d'abonnement.
 *
 * **`transaction_reference` est l'identifiant du document** — elle était déjà
 * unique. Un webhook rejoué écrase alors la même entrée au lieu d'en créer une
 * seconde, ce qui protège du double comptage.
 */
const PaymentHistory = {
  async findById(id: string): Promise<PaymentHistoryRecord | null> {
    if (!id) return null
    return toDoc<PaymentHistoryDocument>(await paymentHistories().doc(id).get())
  },

  async findByReference(reference: string): Promise<PaymentHistoryRecord | null> {
    return PaymentHistory.findById(reference)
  },

  async create(input: {
    user_id: string
    subscription_id: string
    amount: number
    currency?: string
    payment_method: PaymentMethod
    provider?: PaymentProvider
    status?: PaymentStatus
    transaction_reference: string
    provider_transaction_id?: string | null
    metadata?: Record<string, unknown>
  }): Promise<PaymentHistoryRecord> {
    const now = new Date()
    const payload: PaymentHistoryDocument = {
      user_id: input.user_id,
      subscription_id: input.subscription_id,
      amount: input.amount,
      currency: (input.currency ?? 'XOF').toUpperCase(),
      payment_method: input.payment_method,
      provider: input.provider ?? 'wave',
      status: input.status ?? 'pending',
      transaction_reference: input.transaction_reference,
      provider_transaction_id: input.provider_transaction_id ?? null,
      failure_reason: null,
      paid_at: null,
      refunded_at: null,
      refund_reason: null,
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    }

    await paymentHistories()
      .doc(input.transaction_reference)
      .set(toPayload(payload) as unknown as PaymentHistoryDocument)

    return { ...payload, _id: input.transaction_reference }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<PaymentHistoryDocument>
  ): Promise<PaymentHistoryRecord | null> {
    const docRef = paymentHistories().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return null

    await docRef.update(toPayload({ ...patch, updated_at: new Date() }))
    return PaymentHistory.findById(id)
  },

  async findBySubscription(subscriptionId: string): Promise<PaymentHistoryRecord[]> {
    const snapshot = await paymentHistories()
      .where('subscription_id', '==', subscriptionId)
      .orderBy('created_at', 'desc')
      .get()

    return toDocs<PaymentHistoryDocument>(snapshot.docs)
  },

  async paginateByUser(
    userId: string,
    options: { status?: PaymentStatus; limit: number; offset: number }
  ): Promise<{ data: PaymentHistoryRecord[]; total: number }> {
    let base = paymentHistories().where('user_id', '==', userId)
    if (options.status) base = base.where('status', '==', options.status)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<PaymentHistoryDocument>(snapshot.docs), total }
  },
}

export default PaymentHistory
export { PAYMENT_METHODS, PAYMENT_PROVIDERS, PAYMENT_STATUSES }
