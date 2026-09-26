import { readPlanTier, type PlanTier } from '#features/plans/plan_tier'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionDocument } from '#models/subscription'
import type { SubscriptionStatus } from '#utils/enums/subscription_status'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Jours avant l'échéance à partir desquels un abonnement payant se renouvelle.
 *
 * Plus tôt, un paiement ne ferait qu'empiler les périodes ; plus tard, le
 * propriétaire risquerait d'être bloqué le temps que Wave confirme.
 */
export const RENEWAL_WINDOW_DAYS = 7

export interface CurrentSubscription {
  status: SubscriptionStatus
  is_trial: boolean
  plan_tier?: PlanTier | null
  end_date: Date
}

/**
 * Motif de refus d'un paiement d'abonnement, ou `null` s'il peut être lancé.
 *
 * Pas de changement de palier en cours de période : un propriétaire change de
 * forfait à l'échéance. Dans la fenêtre de renouvellement, il ne peut donc
 * reprendre que son palier ; les jours restants sont reportés
 * (`buildPaidSubscription`), et payer un autre palier les convertirait.
 *
 * Un essai, un abonnement échu ou l'absence d'abonnement n'imposent rien.
 */
export function checkoutRefusal(
  current: CurrentSubscription | null,
  planTier: PlanTier,
  now: Date = new Date()
): DomainError | null {
  if (!current || current.is_trial || current.status !== 'active') return null
  if (current.end_date.getTime() <= now.getTime()) return null

  const daysLeft = Math.ceil((current.end_date.getTime() - now.getTime()) / DAY_MS)
  if (daysLeft > RENEWAL_WINDOW_DAYS) {
    return new DomainError(
      'subscription_already_active',
      `Votre abonnement est actif encore ${daysLeft} jours. Le renouvellement ouvre ${RENEWAL_WINDOW_DAYS} jours avant l'échéance.`,
      409
    )
  }

  if (readPlanTier(current.plan_tier) !== planTier) {
    return new DomainError(
      'plan_change_not_allowed',
      "Le changement de forfait se fait à l'échéance de l'abonnement en cours.",
      409
    )
  }

  return null
}

export interface PaidCheckout {
  user_id: string
  plan_id?: string | null
  plan_tier?: PlanTier | null
  duration_days?: number | null
  amount: number
  transaction_reference: string
}

export interface ActivationPlan {
  subscription: Omit<SubscriptionDocument, 'created_at' | 'updated_at'>
  close: { id: string; status: 'cancelled' | 'expired'; reason: string } | null
}

/**
 * Abonnement ouvert par un paiement confirmé, et celui qu'il remplace.
 *
 * Un paiement confirmé est toujours honoré — l'argent est reçu — et un seul
 * abonnement reste vivant :
 *
 * - essai en cours : clos, la période payée commence maintenant ;
 * - abonnement payant en cours (renouvellement) : clos, et ses jours restants
 *   sont reportés en tête de la nouvelle période — payer tôt ne fait rien
 *   perdre ;
 * - abonnement échu que le cron n'a pas encore basculé : marqué `expired`.
 */
export function buildPaidSubscription(
  payment: PaidCheckout,
  current: (CurrentSubscription & { _id: string }) | null,
  now: Date = new Date()
): ActivationPlan {
  const isLive = current !== null && current.end_date.getTime() > now.getTime()
  const carriesOver = isLive && current.status === 'active' && !current.is_trial
  const periodStart = carriesOver ? current.end_date : now
  // Le plan peut avoir été supprimé depuis le paiement : la durée figée fait
  // foi, et 30 jours ne servent qu'aux paiements qui n'en portent pas.
  const durationDays = payment.duration_days ?? 30

  return {
    subscription: {
      user_id: payment.user_id,
      plan_id: payment.plan_id ?? null,
      is_trial: false,
      status: 'active',
      amount: payment.amount,
      plan_tier: readPlanTier(payment.plan_tier),
      start_date: now,
      end_date: new Date(periodStart.getTime() + durationDays * DAY_MS),
      trial_ends_at: null,
      payment_reference: payment.transaction_reference,
      auto_renew: false,
      cancelled_at: null,
      cancel_reason: null,
    },
    close: current ? closingOf(current, isLive) : null,
  }
}

function closingOf(
  current: CurrentSubscription & { _id: string },
  isLive: boolean
): NonNullable<ActivationPlan['close']> {
  if (!isLive) return { id: current._id, status: 'expired', reason: 'renewed' }
  if (current.is_trial || current.status === 'trial') {
    return { id: current._id, status: 'cancelled', reason: 'upgraded_to_plan' }
  }
  if (current.status === 'pending') {
    return { id: current._id, status: 'cancelled', reason: 'superseded' }
  }
  return { id: current._id, status: 'cancelled', reason: 'renewed' }
}

/**
 * La session payée chez Wave correspond-elle au paiement enregistré ?
 *
 * Montant, devise et référence doivent être ceux que l'application a
 * demandés : une session payée pour un autre montant ne vaut pas paiement de
 * ce forfait. Wave renvoie le montant en chaîne.
 */
export function isPaymentConsistent(
  payment: { _id: string; amount: number; currency: string },
  session: { amount: string; currency: string; client_reference: string | null }
): boolean {
  return (
    Number(session.amount) === Number(payment.amount) &&
    session.currency.toUpperCase() === payment.currency.toUpperCase() &&
    (session.client_reference === null || session.client_reference === payment._id)
  )
}
