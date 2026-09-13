import type { SubscriptionStatus } from '#utils/enums/subscription_status'

/**
 * DTO d'entrée/sortie pour les usecases Subscription.
 * Le format de retour est primitivisé (string IDs, Date) afin d'être
 * directement sérialisable JSON.
 */

export interface SubscriptionDto {
  id: string
  user_id: string
  plan_id: string | null
  is_trial: boolean
  status: SubscriptionStatus
  amount: number
  start_date: Date
  end_date: Date
  trial_ends_at: Date | null
  payment_reference: string | null
  auto_renew: boolean
  cancelled_at: Date | null
  cancel_reason: string | null
  created_at: Date
  updated_at: Date
}

export interface StartTrialInput {
  user_id: string
  duration_days?: number
}

export interface SubscribeToPlanInput {
  user_id: string
  plan_id: string
  payment_reference?: string | null
  auto_renew?: boolean
}

export interface CancelSubscriptionInput {
  subscription_id: string
  reason?: string
}

export interface ListSubscriptionsInput {
  status?: SubscriptionStatus
  user_id?: string
  is_trial?: boolean
  page?: number
  per_page?: number
}

export interface ListSubscriptionsOutput {
  data: SubscriptionDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
