import type { PlanTier } from '#features/plans/plan_tier'
import type { PaymentStatus } from '#models/payment_history'

export interface SubscriptionPaymentDto {
  reference: string
  user_id: string
  status: PaymentStatus
  plan_id: string | null
  plan_tier: PlanTier | null
  amount: number
  currency: string
  subscription_id: string | null
  paid_at: Date | null
  created_at: Date
}

export interface SubscriptionCheckoutDto {
  payment: SubscriptionPaymentDto
  /** Lien Wave à ouvrir : il lance l'application Wave sur le téléphone. */
  payment_url: string
}
