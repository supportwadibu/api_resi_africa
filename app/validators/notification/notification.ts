import vine from '@vinejs/vine'

import { NOTIFICATION_AUDIENCES } from '#models/notification_campaign'

/**
 * POST /auth/device-tokens — DELETE /auth/device-tokens
 *
 * Un jeton FCM fait ~160 caractères ; la borne haute laisse de la marge sans
 * accepter n'importe quoi.
 */
export const registerDeviceTokenValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(20).maxLength(4096),
    platform: vine.enum(['android', 'ios', 'web']),
  })
)

export const unregisterDeviceTokenValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(20).maxLength(4096),
  })
)

/**
 * POST /admin/notifications
 *
 * Titre et corps bornés sur ce qu'un écran de verrouillage affiche : au-delà,
 * le texte est tronqué par le système.
 */
export const sendAdminNotificationValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(3).maxLength(80),
    body: vine.string().trim().minLength(3).maxLength(500),
    audience: vine.enum(NOTIFICATION_AUDIENCES),
    owner_ids: vine.array(vine.string().trim().minLength(1)).maxLength(500).optional(),
  })
)

export const listNotificationCampaignsValidator = vine.compile(
  vine.object({
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
