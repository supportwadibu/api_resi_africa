import PaymentHistory, {
  type PaymentHistoryDocument,
  type PaymentHistoryRecord,
  type PaymentStatus,
} from '#models/payment_history'
import type { ActivationPlan } from '#features/subscriptions/subscription_checkout'
import type { PlanTier } from '#features/plans/plan_tier'
import type { SubscriptionDocument } from '#models/subscription'
import type { WithId } from '#firebase/firestore'

import type { SubscriptionPaymentDto } from '../dto/subscription_payment.dto.ts'

/** Paiement d'abonnement tel que les use cases le manipulent. */
export type SubscriptionPaymentRecord = PaymentHistoryRecord

export class SubscriptionPaymentRepository {
  static toDto(doc: PaymentHistoryRecord): SubscriptionPaymentDto {
    return {
      reference: doc._id,
      user_id: doc.user_id,
      status: doc.status,
      plan_id: doc.plan_id ?? null,
      plan_tier: doc.plan_tier ?? null,
      amount: Number(doc.amount),
      currency: doc.currency,
      subscription_id: doc.subscription_id ?? null,
      paid_at: doc.paid_at ?? null,
      created_at: doc.created_at,
    }
  }

  async createPending(input: {
    user_id: string
    reference: string
    plan_id: string
    plan_tier: PlanTier
    duration_days: number
    amount: number
    currency: string
    provider_checkout_id: string
    payment_url: string
  }): Promise<PaymentHistoryRecord> {
    return PaymentHistory.create({
      user_id: input.user_id,
      subscription_id: null,
      plan_id: input.plan_id,
      plan_tier: input.plan_tier,
      duration_days: input.duration_days,
      amount: input.amount,
      currency: input.currency,
      payment_method: 'mobile_money',
      provider: 'wave',
      status: 'pending',
      transaction_reference: input.reference,
      provider_checkout_id: input.provider_checkout_id,
      payment_url: input.payment_url,
    })
  }

  async findByReference(reference: string): Promise<PaymentHistoryRecord | null> {
    return PaymentHistory.findByReference(reference)
  }

  async findByCheckoutId(checkoutId: string): Promise<PaymentHistoryRecord | null> {
    return PaymentHistory.findByCheckoutId(checkoutId)
  }

  async findPendingByUser(userId: string): Promise<PaymentHistoryRecord[]> {
    return PaymentHistory.findPendingByUser(userId)
  }

  async closePending(
    reference: string,
    status: Exclude<PaymentStatus, 'pending' | 'success'>,
    failureReason: string | null
  ): Promise<PaymentHistoryRecord | null> {
    return PaymentHistory.closePending(reference, status, { failure_reason: failureReason })
  }

  async activate(
    reference: string,
    build: (
      payment: PaymentHistoryRecord,
      current: WithId<SubscriptionDocument> | null
    ) => ActivationPlan,
    patch: Partial<PaymentHistoryDocument>
  ) {
    return PaymentHistory.activateSubscription(reference, build, patch)
  }
}

export default SubscriptionPaymentRepository
