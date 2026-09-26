import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'
import { ACTIVE_SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'

import type { SubscriptionStatus } from '#utils/enums/subscription_status'
import type { PlanTier } from '#features/plans/plan_tier'

export interface SubscriptionDocument {
  user_id: string
  plan_id: string | null
  is_trial: boolean
  status: SubscriptionStatus
  amount: number
  /**
   * Palier copié du plan à la souscription, jamais recalculé : repasser un
   * plan de `full` à `basic` ne doit pas retirer des fonctions à qui a payé
   * l'accès complet. Absent sur l'historique et sur les essais — lu via
   * `resolvePlanAccess`.
   */
  plan_tier?: PlanTier | null

  start_date: Date
  end_date: Date
  trial_ends_at: Date | null

  payment_reference: string | null
  auto_renew: boolean

  cancelled_at: Date | null
  cancel_reason: string | null

  created_at: Date
  updated_at: Date
}

export type SubscriptionRecord = WithId<SubscriptionDocument>

function subscriptions() {
  return collection<SubscriptionDocument>(COLLECTIONS.subscriptions)
}

/**
 * Abonnements.
 *
 * Mongo garantissait « au plus un abonnement actif par utilisateur » via un
 * index unique partiel. Firestore n'a pas d'équivalent : `findActiveByUser`
 * permet le contrôle applicatif avant toute création.
 */
const Subscription = {
  async findById(id: string): Promise<SubscriptionRecord | null> {
    if (!id) return null
    return toDoc<SubscriptionDocument>(await subscriptions().doc(id).get())
  },

  async create(input: {
    user_id: string
    plan_id?: string | null
    is_trial?: boolean
    status?: SubscriptionStatus
    amount?: number
    plan_tier?: PlanTier | null
    start_date?: Date
    end_date: Date
    trial_ends_at?: Date | null
    payment_reference?: string | null
    auto_renew?: boolean
  }): Promise<SubscriptionRecord> {
    const now = new Date()
    const payload: SubscriptionDocument = {
      user_id: input.user_id,
      plan_id: input.plan_id ?? null,
      is_trial: input.is_trial ?? false,
      status: input.status ?? 'pending',
      amount: input.amount ?? 0,
      plan_tier: input.plan_tier ?? null,
      start_date: input.start_date ?? now,
      end_date: input.end_date,
      trial_ends_at: input.trial_ends_at ?? null,
      payment_reference: input.payment_reference ?? null,
      auto_renew: input.auto_renew ?? false,
      cancelled_at: null,
      cancel_reason: null,
      created_at: now,
      updated_at: now,
    }

    const docRef = await subscriptions().add(toPayload(payload) as unknown as SubscriptionDocument)
    return { ...payload, _id: docRef.id }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<SubscriptionDocument>
  ): Promise<SubscriptionRecord | null> {
    const docRef = subscriptions().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return null

    await docRef.update(toPayload({ ...patch, updated_at: new Date() }))
    return Subscription.findById(id)
  },

  /**
   * Abonnement en cours d'un utilisateur, quel que soit son état actif
   * (`pending`, `trial`, `active`).
   */
  async findActiveByUser(userId: string): Promise<SubscriptionRecord | null> {
    const snapshot = await subscriptions()
      .where('user_id', '==', userId)
      .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES)
      .limit(1)
      .get()

    return snapshot.empty ? null : toDoc<SubscriptionDocument>(snapshot.docs[0])
  },

  /**
   * Tous les abonnements « vivants » d'un utilisateur.
   *
   * L'unicité n'étant qu'applicative, l'historique peut en porter plusieurs —
   * un `pending` jamais payé à côté d'un abonnement actif. `findActiveByUser`
   * n'en rend qu'un, pris au hasard : insuffisant pour décider d'un accès.
   */
  async findLiveByUser(userId: string): Promise<SubscriptionRecord[]> {
    const snapshot = await subscriptions()
      .where('user_id', '==', userId)
      .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES)
      .get()

    return toDocs<SubscriptionDocument>(snapshot.docs)
  },

  async findByUser(userId: string): Promise<SubscriptionRecord[]> {
    const snapshot = await subscriptions()
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .get()

    return toDocs<SubscriptionDocument>(snapshot.docs)
  },

  /**
   * Abonnements actifs dont la date de fin est dépassée.
   *
   * Le filtre par utilisateur est appliqué en mémoire : Firestore n'admet
   * qu'un seul champ en inégalité par requête, et `end_date` occupe cette
   * place. Le volume concerné — les abonnements arrivés à échéance — reste
   * faible.
   */
  async findOverdue(userId?: string): Promise<SubscriptionRecord[]> {
    const snapshot = await subscriptions()
      .where('status', 'in', ACTIVE_SUBSCRIPTION_STATUSES)
      .where('end_date', '<=', new Date())
      .get()

    const records = toDocs<SubscriptionDocument>(snapshot.docs)
    return userId ? records.filter((r) => r.user_id === userId) : records
  },

  /**
   * Bascule à `expired` les abonnements actifs dont l'échéance est passée.
   *
   * Remplace le `updateMany` de Mongo. Les écritures sont regroupées en un
   * batch : un aller-retour réseau au lieu d'un par document.
   */
  async expireOverdue(userId?: string): Promise<number> {
    const overdue = await Subscription.findOverdue(userId)
    if (overdue.length === 0) return 0

    const now = new Date()
    const batch = subscriptions().firestore.batch()

    for (const record of overdue) {
      batch.update(subscriptions().doc(record._id), {
        status: 'expired',
        cancelled_at: now,
        updated_at: now,
      })
    }
    await batch.commit()

    return overdue.length
  },

  async paginate(options: {
    userId?: string
    status?: SubscriptionStatus
    isTrial?: boolean
    limit: number
    offset: number
  }): Promise<{ data: SubscriptionRecord[]; total: number }> {
    let base = subscriptions() as FirebaseFirestore.Query<SubscriptionDocument>
    if (options.userId) base = base.where('user_id', '==', options.userId)
    if (options.status) base = base.where('status', '==', options.status)
    if (typeof options.isTrial === 'boolean') {
      base = base.where('is_trial', '==', options.isTrial)
    }

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<SubscriptionDocument>(snapshot.docs), total }
  },
}

export default Subscription
