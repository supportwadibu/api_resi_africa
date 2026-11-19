import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionDocument } from '#models/subscription'

import { isLivePaid, type CurrentSubscription } from './subscription_checkout.ts'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SubscriptionGrant {
  user_id: string
  plan_id: string
  plan_tier: PlanTier
  duration_days: number
}

export interface GrantPlan {
  subscription: Omit<SubscriptionDocument, 'created_at' | 'updated_at'>
  close: Array<{ id: string; status: 'cancelled' | 'expired'; reason: string }>
}

/**
 * Abonnement ouvert par un administrateur, sans paiement, et ceux qu'il
 * remplace.
 *
 * Un abonnement payant en cours bloque l'ouverture : le remplacer ferait
 * perdre au propriétaire les jours qu'il a payés, ou son droit au
 * remboursement. L'administrateur le prolonge (`extend`) ou le résilie
 * d'abord. Tout le reste — essai, paiement en attente, abonnement échu que le
 * cron n'a pas encore basculé — est clos, pour qu'un seul abonnement reste
 * vivant. `live` les porte tous : l'unicité n'étant qu'applicative,
 * l'historique peut en compter plusieurs.
 *
 * `amount` et `daily_value` à 0 : rien n'a été payé, donc rien ne se
 * rembourse à la résiliation ni ne se déduit d'une montée de forfait
 * (`unusedValue`). Sans `daily_value` figé, `dailyValueOf` repartirait du
 * montant — 0 aussi, mais par accident.
 */
export function planGrant(
  grant: SubscriptionGrant,
  live: Array<CurrentSubscription & { _id: string }>,
  now: Date = new Date()
): GrantPlan {
  if (live.some((current) => isLivePaid(current, now))) {
    throw new DomainError(
      'subscription_already_active',
      "Ce propriétaire a déjà un abonnement payant en cours. Prolongez-le ou résiliez-le d'abord.",
      409
    )
  }

  return {
    subscription: {
      user_id: grant.user_id,
      plan_id: grant.plan_id,
      is_trial: false,
      status: 'active',
      amount: 0,
      plan_tier: readPlanTier(grant.plan_tier),
      start_date: now,
      end_date: new Date(now.getTime() + grant.duration_days * DAY_MS),
      trial_ends_at: null,
      payment_reference: null,
      auto_renew: false,
      cancelled_at: null,
      cancel_reason: null,
      daily_value: 0,
      refunded_amount: null,
      credit_applied: null,
      retained_credit: null,
      cancel_at_period_end: false,
    },
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
