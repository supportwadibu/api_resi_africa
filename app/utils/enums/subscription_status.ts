/* eslint-disable prettier/prettier */

export const SUBSCRIPTION_STATUSES = [
  'pending',
  'trial',
  'active',
  'expired',
  'cancelled',
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const SubscriptionStatusEnum = {
  PENDING: 'pending',
  TRIAL: 'trial',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, SubscriptionStatus>

export const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'pending',
  'trial',
  'active',
]

/**
 * Durée de l'essai gratuit : « un mois » annoncé au propriétaire.
 *
 * Trente jours plutôt qu'un mois calendaire : toute la chaîne compte l'essai
 * en jours (`startTrialOnce`, jauge des jours restants du mobile), et un mois
 * calendaire ferait varier l'essai de 28 à 31 jours selon la date de
 * validation.
 */
export const TRIAL_DURATION_DAYS = 30
