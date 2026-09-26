import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import type { SubscriptionStatus } from '#utils/enums/subscription_status'

/**
 * Accès ouvert par l'abonnement d'un propriétaire : un palier, ou `null` pour
 * un compte inactif, qui doit souscrire avant d'utiliser l'application.
 */
export type PlanAccess = PlanTier | null

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
  if (subscription.status === 'trial') return 'full'
  if (subscription.status !== 'active') return null
  if (subscription.is_trial) return 'full'

  return readPlanTier(subscription.plan_tier)
}
