import {
  COLLECTIONS,
  collection,
  countQuery,
  db,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

export const NOTIFICATION_AUDIENCES = ['all_owners', 'selected_owners'] as const
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number]

/**
 * Notification envoyée depuis le back-office, groupée ou ciblée.
 *
 * Trace d'audit : qui a envoyé quoi, à qui, avec quel résultat. Jamais relue
 * pour renvoyer — un envoi est définitif.
 */
export interface NotificationCampaignDocument {
  title: string
  body: string
  audience: NotificationAudience
  /** Propriétaires ciblés ; vide pour un envoi groupé. */
  owner_ids: string[]
  /** Comptes joints par au moins un appareil. */
  recipients_count: number
  devices_sent: number
  devices_failed: number
  /** Administrateur à l'origine de l'envoi. */
  created_by: string
  created_at: Date
}

export type NotificationCampaignRecord = WithId<NotificationCampaignDocument>

function campaigns() {
  return collection<NotificationCampaignDocument>(COLLECTIONS.notificationCampaigns)
}

const NotificationCampaign = {
  async create(input: NotificationCampaignDocument): Promise<NotificationCampaignRecord> {
    const ref = await campaigns().add(toPayload(input) as unknown as NotificationCampaignDocument)
    return { ...input, _id: ref.id }
  },

  async paginate(options: {
    limit: number
    offset: number
  }): Promise<{ data: NotificationCampaignRecord[]; total: number }> {
    const base = campaigns().orderBy('created_at', 'desc')
    const [snapshot, total] = await Promise.all([
      base.offset(options.offset).limit(options.limit).get(),
      countQuery(campaigns()),
    ])
    return { data: toDocs<NotificationCampaignDocument>(snapshot.docs), total }
  },
}

/**
 * Trace d'une relance automatique, qui en garantit l'unicité.
 *
 * `create()` échoue si le document existe : l'ordonnanceur peut rappeler la
 * route autant qu'il veut, une étape de relance ne part qu'une fois.
 */
export const NotificationDispatch = {
  /** `true` si la trace vient d'être créée — c'est-à-dire s'il faut envoyer. */
  async claim(id: string, data: { user_id: string; kind: string }): Promise<boolean> {
    try {
      await db()
        .collection(COLLECTIONS.notificationDispatches)
        .doc(id)
        .create(toPayload({ ...data, created_at: new Date() }))
      return true
    } catch (error) {
      // 6 = ALREADY_EXISTS : déjà envoyée par un passage précédent.
      if ((error as { code?: number }).code === 6) return false
      throw error
    }
  },
}

export default NotificationCampaign
