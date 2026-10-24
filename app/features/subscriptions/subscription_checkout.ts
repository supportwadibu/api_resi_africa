import { readPlanTier, tierAllows, type PlanTier } from '#features/plans/plan_tier'
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
 * Abonnement payant en cours, dont la période n'est pas échue.
 *
 * C'est le seul qui se renouvelle, se résilie avec remboursement ou sert de
 * crédit à une montée de forfait : un essai n'a rien coûté, un abonnement
 * échu n'a plus de jours à rendre.
 */
export function isLivePaid(
  current: CurrentSubscription | null,
  now: Date = new Date()
): current is CurrentSubscription {
  return (
    current !== null &&
    !current.is_trial &&
    current.status === 'active' &&
    current.end_date.getTime() > now.getTime()
  )
}

/**
 * Le paiement de `planTier` est-il une montée de forfait ?
 *
 * Une montée s'applique tout de suite, au prorata : le propriétaire qui passe
 * de Pro à Pro+ en cours de mois n'a pas à attendre l'échéance pour ouvrir
 * les fonctions qu'il paie. La descente, elle, attend l'échéance — on ne
 * rembourse pas un palier qu'on quitte, le propriétaire qui veut récupérer
 * son argent résilie.
 */
export function isUpgrade(
  current: CurrentSubscription | null,
  planTier: PlanTier,
  now: Date = new Date()
): boolean {
  return (
    isLivePaid(current, now) &&
    tierAllows(planTier, readPlanTier(current.plan_tier)) &&
    readPlanTier(current.plan_tier) !== planTier
  )
}

/**
 * Jours payés restants, sans le jour en cours.
 *
 * Le jour entamé compte comme consommé : le propriétaire a eu accès ce
 * jour-là, et le lui rendre ferait qu'une résiliation le soir même du
 * paiement rembourserait plus qu'il n'a consommé de rien.
 */
export function remainingPaidDays(endDate: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / DAY_MS))
}

/**
 * Valeur d'un jour d'abonnement, en francs.
 *
 * `daily_value` est figé à l'activation. L'historique ne le porte pas : il se
 * déduit alors du montant payé et de la durée du plan, 30 jours à défaut d'un
 * plan encore lisible — la durée de tous les forfaits vendus jusqu'ici.
 */
export function dailyValueOf(
  subscription: { amount: number; daily_value?: number | null },
  planDurationDays?: number | null
): number {
  if (typeof subscription.daily_value === 'number') return subscription.daily_value
  const duration = planDurationDays && planDurationDays > 0 ? planDurationDays : 30
  return Number(subscription.amount) / duration
}

/**
 * Valeur des jours payés non consommés, au franc inférieur.
 *
 * C'est à la fois le remboursement d'une résiliation et le crédit déduit
 * d'une montée de forfait : les deux rendent au propriétaire exactement ce
 * qu'il n'a pas utilisé. Au franc inférieur, le franc CFA n'ayant pas de
 * subdivision : RESI ne rend jamais plus que la valeur restante.
 */
export function unusedValue(
  subscription: { amount: number; end_date: Date; daily_value?: number | null },
  planDurationDays: number | null | undefined,
  now: Date = new Date()
): number {
  const days = remainingPaidDays(subscription.end_date, now)
  return Math.floor(dailyValueOf(subscription, planDurationDays) * days)
}

/**
 * Prix d'une montée de forfait : le nouveau forfait, moins la valeur des jours
 * restants de l'ancien.
 *
 * `amount` peut tomber à zéro ou moins si l'ancien forfait valait plus par
 * jour que le nouveau sur la période restante — l'appelant refuse alors, Wave
 * n'encaissant pas de montant nul.
 */
export function upgradeQuote(
  current: { amount: number; end_date: Date; daily_value?: number | null },
  currentPlanDurationDays: number | null | undefined,
  newPlanPrice: number,
  now: Date = new Date()
): { credit: number; amount: number } {
  const credit = unusedValue(current, currentPlanDurationDays, now)
  return { credit, amount: Math.round(newPlanPrice) - credit }
}

/**
 * Motif de refus d'un paiement d'abonnement, ou `null` s'il peut être lancé.
 *
 * - Montée de forfait : toujours possible, au prorata (`isUpgrade`).
 * - Même palier : seulement dans la fenêtre de renouvellement ; les jours
 *   restants sont reportés (`buildPaidSubscription`).
 * - Palier inférieur : à l'échéance.
 *
 * Un essai, un abonnement échu ou l'absence d'abonnement n'imposent rien.
 */
export function checkoutRefusal(
  current: CurrentSubscription | null,
  planTier: PlanTier,
  now: Date = new Date()
): DomainError | null {
  if (!isLivePaid(current, now)) return null
  if (isUpgrade(current, planTier, now)) return null

  if (readPlanTier(current.plan_tier) !== planTier) {
    return new DomainError(
      'plan_change_not_allowed',
      "Le passage à un forfait inférieur se fait à l'échéance de l'abonnement en cours.",
      409
    )
  }

  const daysLeft = Math.ceil((current.end_date.getTime() - now.getTime()) / DAY_MS)
  if (daysLeft > RENEWAL_WINDOW_DAYS) {
    return new DomainError(
      'subscription_already_active',
      `Votre abonnement est actif encore ${daysLeft} jours. Le renouvellement ouvre ${RENEWAL_WINDOW_DAYS} jours avant l'échéance.`,
      409
    )
  }

  return null
}

/**
 * Le renouvellement est-il ouvert ? Faux pour un abonnement payant en cours
 * hors de sa fenêtre : l'écran n'affiche alors pas « Renouveler ».
 */
export function isRenewable(current: CurrentSubscription | null, now: Date = new Date()): boolean {
  if (!isLivePaid(current, now)) return true
  return Math.ceil((current.end_date.getTime() - now.getTime()) / DAY_MS) <= RENEWAL_WINDOW_DAYS
}

export interface PaidCheckout {
  user_id: string
  plan_id?: string | null
  plan_tier?: PlanTier | null
  duration_days?: number | null
  amount: number
  transaction_reference: string
  /**
   * Valeur des jours restants de l'abonnement quitté, déduite du prix : posée
   * pour une montée de forfait seulement (`metadata.upgrade_credit`).
   */
  upgrade_credit?: number | null
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
 * - abonnement échu que le cron n'a pas encore basculé : marqué `expired` ;
 * - montée de forfait : l'ancien est clos sans report — ses jours restants
 *   ont déjà été déduits du prix payé (`upgrade_credit`).
 */
export function buildPaidSubscription(
  payment: PaidCheckout,
  current: (CurrentSubscription & { _id: string }) | null,
  now: Date = new Date()
): ActivationPlan {
  const isUpgradePayment = typeof payment.upgrade_credit === 'number'
  const isLive = current !== null && current.end_date.getTime() > now.getTime()
  const carriesOver =
    isLive && current.status === 'active' && !current.is_trial && !isUpgradePayment
  const periodStart = carriesOver ? current.end_date : now
  // Le plan peut avoir été supprimé depuis le paiement : la durée figée fait
  // foi, et 30 jours ne servent qu'aux paiements qui n'en portent pas.
  const durationDays = payment.duration_days ?? 30
  // Valeur d'un jour, figée : remboursement et crédit de montée s'en
  // déduisent. Le crédit d'une montée y est réintégré — la période vaut le
  // prix du forfait, même si le propriétaire n'en a payé qu'une partie.
  const dailyValue = (payment.amount + (payment.upgrade_credit ?? 0)) / durationDays

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
      daily_value: dailyValue,
      refunded_amount: null,
    },
    close: current ? closingOf(current, isLive, isUpgradePayment) : null,
  }
}

function closingOf(
  current: CurrentSubscription & { _id: string },
  isLive: boolean,
  isUpgradePayment: boolean
): NonNullable<ActivationPlan['close']> {
  if (!isLive) return { id: current._id, status: 'expired', reason: 'renewed' }
  if (isUpgradePayment && current.status === 'active' && !current.is_trial) {
    return { id: current._id, status: 'cancelled', reason: 'upgraded' }
  }
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
