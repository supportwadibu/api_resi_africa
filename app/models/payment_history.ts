import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  transaction,
  type WithId,
} from '#firebase/firestore'
import type { SubscriptionDocument } from '#models/subscription'
import type { PlanTier } from '#features/plans/plan_tier'
import type { ActivationPlan } from '#features/subscriptions/subscription_checkout'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'

/**
 * `expired` : session Wave abandonnée ou remplacée par un paiement plus récent
 * — rien n'a été débité.
 */
const PAYMENT_STATUSES = ['pending', 'success', 'failed', 'refunded', 'expired'] as const
const PAYMENT_METHODS = ['mobile_money', 'card', 'bank_transfer'] as const
const PAYMENT_PROVIDERS = ['wave'] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

export interface PaymentHistoryDocument {
  user_id: string
  /**
   * Abonnement ouvert par ce paiement. `null` tant que le paiement n'est pas
   * confirmé : l'abonnement n'est créé qu'une fois l'argent reçu. Les documents
   * antérieurs au paiement Wave dans l'application en portent tous un.
   */
  subscription_id: string | null

  /**
   * Plan choisi, figé au lancement du paiement avec son palier et sa durée :
   * le propriétaire reçoit ce qu'il a payé, même si le plan est modifié
   * entre-temps. Absents sur l'historique.
   */
  plan_id?: string | null
  plan_tier?: PlanTier | null
  duration_days?: number | null

  /** Session Wave : identifiant et lien de paiement, repris si le propriétaire relance. */
  provider_checkout_id?: string | null
  payment_url?: string | null
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
    subscription_id?: string | null
    plan_id?: string | null
    plan_tier?: PlanTier | null
    duration_days?: number | null
    provider_checkout_id?: string | null
    payment_url?: string | null
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
      subscription_id: input.subscription_id ?? null,
      plan_id: input.plan_id ?? null,
      plan_tier: input.plan_tier ?? null,
      duration_days: input.duration_days ?? null,
      provider_checkout_id: input.provider_checkout_id ?? null,
      payment_url: input.payment_url ?? null,
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

  async findByCheckoutId(checkoutId: string): Promise<PaymentHistoryRecord | null> {
    if (!checkoutId) return null
    const snapshot = await paymentHistories()
      .where('provider_checkout_id', '==', checkoutId)
      .limit(1)
      .get()

    return snapshot.empty ? null : toDoc<PaymentHistoryDocument>(snapshot.docs[0])
  },

  /**
   * Paiements encaissés depuis une date.
   *
   * Filtre sur `paid_at` seul : il n'est posé qu'à la confirmation d'un
   * paiement, si bien qu'un seul champ en inégalité suffit — sans index
   * composite. Le statut est revérifié en mémoire pour un paiement remboursé.
   */
  async findPaidSince(from: Date): Promise<PaymentHistoryRecord[]> {
    const snapshot = await paymentHistories().where('paid_at', '>=', from).get()
    return toDocs<PaymentHistoryDocument>(snapshot.docs).filter((p) => p.status === 'success')
  },

  /** Paiements d'un propriétaire encore en attente chez Wave. */
  async findPendingByUser(userId: string): Promise<PaymentHistoryRecord[]> {
    const snapshot = await paymentHistories()
      .where('user_id', '==', userId)
      .where('status', '==', 'pending')
      .get()

    return toDocs<PaymentHistoryDocument>(snapshot.docs)
  },

  /**
   * Clôt un paiement resté en attente, sans rien activer.
   *
   * Transactionnel : une confirmation concurrente peut l'avoir fait passer à
   * `success` entre la lecture et l'écriture, et l'écraser en `expired`
   * effacerait la trace d'un abonnement payé.
   */
  async closePending(
    reference: string,
    status: Exclude<PaymentStatus, 'pending' | 'success'>,
    patch: Partial<PaymentHistoryDocument> = {}
  ): Promise<PaymentHistoryRecord | null> {
    const docRef = paymentHistories().doc(reference)
    const closed = await transaction(async (tx) => {
      const snapshot = await tx.get(docRef)
      if (!snapshot.exists || snapshot.data()?.status !== 'pending') return false

      tx.update(docRef, toPayload({ ...patch, status, updated_at: new Date() }))
      return true
    })

    return closed ? PaymentHistory.findById(reference) : null
  },

  /**
   * Confirme un paiement et ouvre l'abonnement qu'il a payé, d'un seul tenant.
   *
   * Une transaction plutôt que deux écritures : le webhook Wave et le retour
   * du propriétaire dans l'application confirment souvent au même instant, et
   * Wave rejoue ses webhooks. Le statut du paiement est relu dans la
   * transaction — seul un paiement encore `pending` ouvre un abonnement — si
   * bien qu'un même paiement ne peut en créer deux.
   *
   * `build` reçoit l'abonnement vivant du propriétaire et rend l'abonnement à
   * créer, et celui à clore s'il y a lieu. La règle reste dans le use case ; ce
   * modèle ne fait que l'appliquer atomiquement.
   */
  async activateSubscription(
    reference: string,
    build: (
      payment: PaymentHistoryRecord,
      current: WithId<SubscriptionDocument> | null
    ) => ActivationPlan,
    patch: Partial<PaymentHistoryDocument>
  ): Promise<{ payment: PaymentHistoryRecord; activated: boolean } | null> {
    const paymentRef = paymentHistories().doc(reference)
    const subscriptions = collection<SubscriptionDocument>(COLLECTIONS.subscriptions)

    const activated = await transaction(async (tx) => {
      const paymentSnapshot = await tx.get(paymentRef)
      const payment = toDoc<PaymentHistoryDocument>(paymentSnapshot)
      if (!payment) return null
      if (payment.status !== 'pending') return false

      const currentSnapshot = await tx.get(
        subscriptions
          .where('user_id', '==', payment.user_id)
          .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES)
          .limit(1)
      )
      const current = currentSnapshot.empty
        ? null
        : toDoc<SubscriptionDocument>(currentSnapshot.docs[0])

      const { subscription, close } = build(payment, current)
      const now = new Date()

      if (close) {
        tx.update(
          subscriptions.doc(close.id),
          toPayload({
            status: close.status,
            cancelled_at: now,
            cancel_reason: close.reason,
            updated_at: now,
          })
        )
      }

      const subscriptionRef = subscriptions.doc()
      tx.set(
        subscriptionRef,
        toPayload({
          ...subscription,
          created_at: now,
          updated_at: now,
        }) as unknown as SubscriptionDocument
      )
      tx.update(
        paymentRef,
        toPayload({
          ...patch,
          status: 'success',
          subscription_id: subscriptionRef.id,
          paid_at: now,
          updated_at: now,
        })
      )
      return true
    })

    if (activated === null) return null
    const payment = await PaymentHistory.findById(reference)
    return payment ? { payment, activated } : null
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
