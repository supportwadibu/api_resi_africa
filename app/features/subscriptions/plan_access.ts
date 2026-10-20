import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import type { SubscriptionStatus } from '#utils/enums/subscription_status'

/**
 * Accès ouvert par l'abonnement d'un propriétaire : un palier, ou `null` pour
 * un compte inactif, qui doit souscrire avant d'utiliser l'application.
 */
export type PlanAccess = PlanTier | null

/**
 * Accès traduit pour les applications antérieures aux paliers actuels, qui ne
 * connaissent que `full` et `basic` et lisent tout autre code comme un compte
 * inactif.
 */
export function legacyPlanAccess(access: PlanAccess): 'full' | 'basic' | null {
  if (access === null) return null
  return access === 'pro_plus' ? 'full' : 'basic'
}

export interface PlanAccessSubscription {
  status: SubscriptionStatus
  is_trial: boolean
  plan_tier?: PlanTier | null
  end_date: Date
}

/**
 * Accès effectif d'un abonnement à un instant donné.
 *
 * L'échéance est comparée ici plutôt que confiée à `expireOverdue` : la
 * résolution a lieu à chaque requête, et l'expiration passive fait une
 * requête globale suivie d'un batch d'écritures. Un abonnement échu que le
 * cron n'a pas encore basculé n'ouvre donc déjà plus rien.
 *
 * `pending` n'ouvre aucun accès bien qu'il figure parmi les statuts
 * « vivants » : il désigne un abonnement non payé.
 */
export function resolvePlanAccess(
  subscription: PlanAccessSubscription | null,
  now: Date = new Date()
): PlanAccess {
  if (!subscription) return null
  if (subscription.end_date.getTime() <= now.getTime()) return null

  // L'essai fait découvrir le forfait complet.
  if (subscription.status === 'trial') return 'pro_plus'
  if (subscription.status !== 'active') return null
  if (subscription.is_trial) return 'pro_plus'

  return readPlanTier(subscription.plan_tier)
}
