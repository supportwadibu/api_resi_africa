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

export const TRIAL_DURATION_DAYS = 14
