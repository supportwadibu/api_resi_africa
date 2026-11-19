import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import { DomainError } from '#utils/domain_error'

import type { PaymentHistoryDocument, PaymentMethod } from '#models/payment_history'
import type { SubscriptionDocument } from '#models/subscription'

import { isLivePaid, type CurrentSubscription } from './subscription_checkout.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** Moyens d'un paiement reçu hors application, au choix de l'administrateur. */
export const MANUAL_PAYMENT_METHODS = [
  'cash',
  'mobile_money',
  'bank_transfer',
] as const satisfies readonly PaymentMethod[]
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]

export interface SubscriptionGrant {
  user_id: string
  plan_id: string
  plan_tier: PlanTier
  duration_days: number
  /** Montant reçu hors application, en francs ; 0 pour un abonnement offert. */
  amount: number
  payment_method: ManualPaymentMethod
  /** Référence de l'encaissement (reçu, transaction Orange Money…), facultative. */
  external_reference: string | null
  /** Identifiant du paiement enregistré, tiré par l'appelant. */
  transaction_reference: string
  admin_id: string
  note: string | null
}

export interface GrantPlan {
  subscription: Omit<SubscriptionDocument, 'created_at' | 'updated_at'>
  /**
   * Encaissement enregistré à côté de l'abonnement : c'est l'historique des
   * paiements que lit le revenu de RESI. `null` pour un abonnement offert —
   * un paiement à 0 F n'a rien rapporté.
   */
  payment: Omit<PaymentHistoryDocument, 'subscription_id' | 'created_at' | 'updated_at'> | null
  close: Array<{ id: string; status: 'cancelled' | 'expired'; reason: string }>
}

/**
 * Valeur d'empreinte d'une demande d'enregistrement : le code reçu par
 * l'administrateur ne vaut que pour ce propriétaire, ce forfait et ce montant.
 * Changer l'un d'eux après la demande exige un nouveau code.
 */
export function grantContext(input: { user_id: string; plan_id: string; amount: number }): string {
  return `${input.user_id}:${input.plan_id}:${input.amount}`
}

/** Refus d'ouverture : un abonnement payant en cours, que l'ouverture écraserait. */
export function grantRefusal(
  live: CurrentSubscription[],
  now: Date = new Date()
): DomainError | null {
  return live.some((current) => isLivePaid(current, now))
    ? new DomainError(
        'subscription_already_active',
        "Ce propriétaire a déjà un abonnement payant en cours. Prolongez-le ou résiliez-le d'abord.",
        409
      )
    : null
}

/**
 * Abonnement enregistré par un administrateur, sans paiement dans
 * l'application, l'encaissement qui l'accompagne et ceux qu'il remplace.
 *
 * Un abonnement payant en cours bloque l'ouverture : le remplacer ferait
 * perdre au propriétaire les jours qu'il a payés, ou son droit au
 * remboursement. L'administrateur le prolonge (`extend`) ou le résilie
 * d'abord. Tout le reste — essai, paiement en attente, abonnement échu que le
 * cron n'a pas encore basculé — est clos, pour qu'un seul abonnement reste
 * vivant. `live` les porte tous : l'unicité n'étant qu'applicative,
 * l'historique peut en compter plusieurs.
 *
 * Le montant est figé comme pour un paiement Wave, `daily_value` compris :
 * une montée de forfait déduit les jours payés restants. La résiliation, elle,
 * ne rembourse rien (`recorded_by_admin`).
 */
export function planGrant(
  grant: SubscriptionGrant,
  live: Array<CurrentSubscription & { _id: string }>,
  now: Date = new Date()
): GrantPlan {
  const refusal = grantRefusal(live, now)
  if (refusal) throw refusal

  const tier = readPlanTier(grant.plan_tier)
  const paid = grant.amount > 0

  return {
    subscription: {
      user_id: grant.user_id,
      plan_id: grant.plan_id,
      is_trial: false,
      status: 'active',
      amount: grant.amount,
      plan_tier: tier,
      start_date: now,
      end_date: new Date(now.getTime() + grant.duration_days * DAY_MS),
      trial_ends_at: null,
      payment_reference: paid ? grant.transaction_reference : null,
      auto_renew: false,
      cancelled_at: null,
      cancel_reason: null,
      daily_value: grant.amount / grant.duration_days,
      refunded_amount: null,
      credit_applied: null,
      retained_credit: null,
      cancel_at_period_end: false,
      recorded_by_admin: true,
    },
    payment: paid
      ? {
          user_id: grant.user_id,
          plan_id: grant.plan_id,
          plan_tier: tier,
          duration_days: grant.duration_days,
          provider_checkout_id: null,
          payment_url: null,
          amount: grant.amount,
          currency: 'XOF',
          payment_method: grant.payment_method,
          provider: 'manual',
          status: 'success',
          transaction_reference: grant.transaction_reference,
          provider_transaction_id: grant.external_reference,
          failure_reason: null,
          paid_at: now,
          refunded_at: null,
          refund_reason: null,
          metadata: { recorded_by: grant.admin_id, note: grant.note },
        }
      : null,
    close: live.map((current) => closingOf(current, now)),
  }
}

function closingOf(
  current: CurrentSubscription & { _id: string },
  now: Date
): GrantPlan['close'][number] {
  if (current.end_date.getTime() <= now.getTime()) {
    return { id: current._id, status: 'expired', reason: 'granted_by_admin' }
  }
  if (current.is_trial || current.status === 'trial') {
    return { id: current._id, status: 'cancelled', reason: 'upgraded_to_plan' }
  }
  return { id: current._id, status: 'cancelled', reason: 'superseded' }
}
