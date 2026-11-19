import { SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'

import vine from '@vinejs/vine'

import { PAID_PLAN_TIERS } from '#features/plans/plan_tier'
import { MAX_EXTENSION_DAYS } from '#features/subscriptions/subscription_extension'
import { MANUAL_PAYMENT_METHODS } from '#features/subscriptions/subscription_grant'

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

/** POST /proprio/subscription/trial — palier choisi pour l'essai gratuit. */
export const startTrialValidator = vine.compile(
  vine.object({
    tier: vine.enum(PAID_PLAN_TIERS),
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

// Identifiants Firestore : longueur libre, bornée par sécurité.
const grantTarget = {
  user_id: vine.string().trim().minLength(1).maxLength(128),
  plan_id: vine.string().trim().minLength(1).maxLength(128),
  /** Montant reçu hors application, en francs ; le prix du plan à défaut. */
  amount: vine.number().min(0).max(10_000_000).withoutDecimals().optional(),
}

/** POST /admin/subscriptions/code — envoie le code de validation à l'admin. */
export const requestSubscriptionGrantCodeValidator = vine.compile(vine.object(grantTarget))

/** POST /admin/subscriptions — enregistre l'abonnement, code à l'appui. */
export const grantSubscriptionValidator = vine.compile(
  vine.object({
    ...grantTarget,
    payment_method: vine.enum(MANUAL_PAYMENT_METHODS).optional(),
    payment_reference: vine.string().trim().maxLength(120).optional(),
    note: vine.string().trim().maxLength(500).optional(),
    code: vine
      .string()
      .trim()
      .fixedLength(6)
      .regex(/^\d{6}$/),
  })
)
