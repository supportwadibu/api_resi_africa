import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

const SUBSCRIPTION_EVENT_TYPES = [
  'created',
  'activated',
  'renewed',
  'cancelled',
  'expired',
  'suspended',
  'resumed',
  'payment_failed',
  'payment_succeeded',
  'trial_started',
  'trial_ended',
  'plan_changed',
  /** Échéance repoussée par un administrateur, sans paiement. */
  'extended',
  'auto_renew_enabled',
  'auto_renew_disabled',
] as const

const TRIGGERED_BY = ['system', 'user', 'admin', 'webhook'] as const

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number]
export type TriggeredBy = (typeof TRIGGERED_BY)[number]

export interface SubscriptionEventDocument {
  user_id: string
  subscription_id: string
  event_type: SubscriptionEventType
  description: string
  previous_status: string | null
  new_status: string | null
  payment_id: string | null
  metadata: Record<string, unknown>
  triggered_by: TriggeredBy
  triggered_by_user_id: string | null
  created_at: Date
  updated_at: Date
}

export type SubscriptionEventRecord = WithId<SubscriptionEventDocument>

function events() {
  return collection<SubscriptionEventDocument>(COLLECTIONS.subscriptionEvents)
}

/** Journal d'audit du cycle de vie des abonnements. */
const SubscriptionEvent = {
  async findById(id: string): Promise<SubscriptionEventRecord | null> {
    if (!id) return null
    return toDoc<SubscriptionEventDocument>(await events().doc(id).get())
  },

  async create(input: {
    user_id: string
    subscription_id: string
    event_type: SubscriptionEventType
    description: string
    previous_status?: string | null
    new_status?: string | null
    payment_id?: string | null
    metadata?: Record<string, unknown>
    triggered_by?: TriggeredBy
    triggered_by_user_id?: string | null
  }): Promise<SubscriptionEventRecord> {
    const now = new Date()
    const payload: SubscriptionEventDocument = {
      user_id: input.user_id,
      subscription_id: input.subscription_id,
      event_type: input.event_type,
      description: input.description,
      previous_status: input.previous_status ?? null,
      new_status: input.new_status ?? null,
      payment_id: input.payment_id ?? null,
      metadata: input.metadata ?? {},
      triggered_by: input.triggered_by ?? 'system',
      triggered_by_user_id: input.triggered_by_user_id ?? null,
      created_at: now,
      updated_at: now,
    }

    const docRef = await events().add(toPayload(payload) as unknown as SubscriptionEventDocument)
    return { ...payload, _id: docRef.id }
  },

  async findBySubscription(subscriptionId: string, limit = 50): Promise<SubscriptionEventRecord[]> {
    const snapshot = await events()
      .where('subscription_id', '==', subscriptionId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()

    return toDocs<SubscriptionEventDocument>(snapshot.docs)
  },

  async findByUser(userId: string, limit = 50): Promise<SubscriptionEventRecord[]> {
    const snapshot = await events()
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get()

    return toDocs<SubscriptionEventDocument>(snapshot.docs)
  },
}

export default SubscriptionEvent
export { SUBSCRIPTION_EVENT_TYPES }
