import type { NotificationAudience } from '#models/notification_campaign'

export type { NotificationAudience }

export interface NotificationCampaignDto {
  id: string
  title: string
  body: string
  audience: NotificationAudience
  owner_ids: string[]
  /** Comptes joints par au moins un appareil. */
  recipients_count: number
  devices_sent: number
  devices_failed: number
  created_by: string
  created_at: Date
}

export interface SendAdminNotificationInput {
  title: string
  body: string
  audience: NotificationAudience
  /** Requis pour `selected_owners`, ignoré sinon. */
  owner_ids?: string[]
  created_by: string
}

/** Bilan d'un passage de l'ordonnanceur, rendu à cron-job.org. */
export interface SubscriptionRemindersResult {
  /** Abonnements dont l'échéance tombe dans les huit jours. */
  examined: number
  /** Relances parties à ce passage. */
  reminders_sent: number
  /** Relances déjà envoyées par un passage précédent. */
  already_sent: number
  devices_sent: number
  devices_failed: number
}
