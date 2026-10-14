import { SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'

import vine from '@vinejs/vine'

import { MAX_EXTENSION_DAYS } from '#features/subscriptions/subscription_extension'

export const subscribeToPlanValidator = vine.compile(
  vine.object({
    plan_id: vine.string().trim().minLength(24).maxLength(24),
    payment_reference: vine.string().trim().maxLength(120).optional(),
    auto_renew: vine.boolean().optional(),
  })
)

/**
 * POST /proprio/subscription/checkout
 *
 * Identifiant Firestore : la borne Mongo de 24 caractères de
 * `subscribeToPlanValidator` rejetterait tout plan réel.
 */
export const subscriptionCheckoutValidator = vine.compile(
  vine.object({
    plan_id: vine.string().trim().minLength(1).maxLength(128),
  })
)

export const listSubscriptionsValidator = vine.compile(
  vine.object({
    status: vine.enum(SUBSCRIPTION_STATUSES).optional(),
    // Identifiant Firestore (20 caractères), et non plus un ObjectId Mongo de 24 :
    // la borne héritée de la migration rejetait tout identifiant réel.
    user_id: vine.string().trim().minLength(1).maxLength(128).optional(),
    is_trial: vine.boolean().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

/**
 * PATCH /admin/subscriptions/:id/extend
 */
export const extendSubscriptionValidator = vine.compile(
  vine.object({
    days: vine.number().withoutDecimals().min(1).max(MAX_EXTENSION_DAYS),
    reason: vine.string().trim().minLength(3).maxLength(500).optional(),
  })
)

export const cancelSubscriptionValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(3).maxLength(500).optional(),
  })
)
