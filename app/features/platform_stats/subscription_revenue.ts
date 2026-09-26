import { growthPercent, monthWindow } from '#features/bookings/booking_stats'
import type { PlanTier } from '#features/plans/plan_tier'

import { monthKey } from './revenue_series.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/** Durée d'un mois de référence pour ramener un abonnement à un revenu mensuel. */
const MONTH_DAYS = 30

/** Paiement d'abonnement encaissé : l'argent que RESI a réellement reçu. */
export interface EarnedPayment {
  amount: number
  paid_at: Date
}

/** Abonnement payant en cours, avec la durée de sa période. */
export interface PaidSubscription {
  amount: number
  end_date: Date
  plan_tier: PlanTier
  duration_days: number
}

export interface TrialSubscription {
  end_date: Date
}

export interface MonthAmount {
  /** `AAAA-MM`, en UTC. */
  month: string
  amount: number
  /** Paiements encaissés (passé) ou renouvellements attendus (prévision). */
  count: number
}

/**
 * Revenu de RESI : les abonnements des propriétaires, et non l'argent de
 * leurs réservations — celui-ci revient aux propriétaires.
 */
export interface SubscriptionRevenueDto {
  generated_at: Date

  /** Encaissé : paiements Wave confirmés, rattachés au mois du paiement. */
  earned: {
    total: number
    this_month: number
    previous_month: number
    growth_percent: number | null
    /** Du mois le plus ancien au mois en cours. */
    series: MonthAmount[]
  }

  /** Revenu mensuel récurrent des abonnements payants en cours. */
  recurring: {
    mrr: number
    paying_subscribers: number
    by_tier: Record<PlanTier, { subscribers: number; mrr: number }>
  }

  /**
   * Prévision : renouvellements attendus si chaque abonné payant renouvelle
   * au même prix. Le mois en cours ne compte que ce qui reste à venir — ce
   * qui est déjà encaissé est dans `earned`.
   */
  forecast: {
    total: number
    /** Du mois en cours au dernier mois prévu. */
    series: MonthAmount[]
  }

  /** Essais en cours : un potentiel, jamais compté dans la prévision. */
  trials: {
    in_progress: number
    ending_within_30_days: number
    /** Revenu mensuel si tous convertissaient au forfait le moins cher. */
    potential_mrr_min: number
    /** … au forfait le plus cher. */
    potential_mrr_max: number
  }
}

/** Montant ramené à un mois de 30 jours, arrondi au franc. */
function monthly(amount: number, durationDays: number): number {
  return (amount * MONTH_DAYS) / Math.max(1, durationDays)
}

/**
 * Chiffres d'abonnement du tableau de bord.
 *
 * Fonction pure : elle reçoit paiements, abonnements et prix, et s'éprouve
 * sans Firestore.
 *
 * L'encaissé se lit sur les paiements et non sur les abonnements : un
 * abonnement prolongé par un administrateur, ou un essai, ne rapporte rien, et
 * un renouvellement clôt l'abonnement précédent sans que son argent disparaisse.
 *
 * La prévision déroule, pour chaque abonné payant, ses échéances successives
 * — fin de la période en cours, puis tous les `duration_days` — jusqu'à la fin
 * de la fenêtre. C'est une hypothèse de renouvellement intégral : un plafond,
 * pas une promesse, et l'écran le dit.
 */
export function buildSubscriptionRevenue(input: {
  payments: readonly EarnedPayment[]
  paidSubscriptions: readonly PaidSubscription[]
  trials: readonly TrialSubscription[]
  /** Prix des forfaits proposés, pour le potentiel des essais. */
  planPrices: readonly number[]
  now: Date
  monthsBack: number
  monthsAhead: number
}): SubscriptionRevenueDto {
  const { now } = input

  // ── Encaissé ──────────────────────────────────────────────────────────────
  const earnedSeries: MonthAmount[] = []
  for (let offset = -(input.monthsBack - 1); offset <= 0; offset++) {
    const window = monthWindow(now, offset)
    const inMonth = input.payments.filter((p) => p.paid_at >= window.from && p.paid_at < window.to)
    earnedSeries.push({
      month: monthKey(window.from),
      amount: inMonth.reduce((sum, p) => sum + p.amount, 0),
      count: inMonth.length,
    })
  }

  const thisMonth = earnedSeries.at(-1)?.amount ?? 0
  const previousWindow = monthWindow(now, -1)
  const previousMonth = input.payments
    .filter((p) => p.paid_at >= previousWindow.from && p.paid_at < previousWindow.to)
    .reduce((sum, p) => sum + p.amount, 0)

  // ── Récurrent ─────────────────────────────────────────────────────────────
  const live = input.paidSubscriptions.filter((s) => s.end_date.getTime() > now.getTime())
  const byTier: SubscriptionRevenueDto['recurring']['by_tier'] = {
    basic: { subscribers: 0, mrr: 0 },
    full: { subscribers: 0, mrr: 0 },
  }
  for (const subscription of live) {
    const tier = byTier[subscription.plan_tier]
    tier.subscribers += 1
    tier.mrr += monthly(subscription.amount, subscription.duration_days)
  }
  byTier.basic.mrr = Math.round(byTier.basic.mrr)
  byTier.full.mrr = Math.round(byTier.full.mrr)

  // ── Prévision ─────────────────────────────────────────────────────────────
  const forecastSeries: MonthAmount[] = []
  for (let offset = 0; offset < input.monthsAhead; offset++) {
    forecastSeries.push({ month: monthKey(monthWindow(now, offset).from), amount: 0, count: 0 })
  }
  const horizon = monthWindow(now, input.monthsAhead - 1).to
  const slot = new Map(forecastSeries.map((point) => [point.month, point]))

  for (const subscription of live) {
    const step = Math.max(1, subscription.duration_days) * DAY_MS
    for (let due = subscription.end_date.getTime(); due < horizon.getTime(); due += step) {
      const window = monthWindow(new Date(due), 0)
      const point = slot.get(monthKey(window.from))
      if (!point) continue
      point.amount += subscription.amount
      point.count += 1
    }
  }

  // ── Essais ────────────────────────────────────────────────────────────────
  const trials = input.trials.filter((t) => t.end_date.getTime() > now.getTime())
  const soon = new Date(now.getTime() + 30 * DAY_MS)
  const prices = input.planPrices.filter((price) => price > 0)

  return {
    generated_at: now,
    earned: {
      total: earnedSeries.reduce((sum, point) => sum + point.amount, 0),
      this_month: thisMonth,
      previous_month: previousMonth,
      growth_percent: growthPercent(thisMonth, previousMonth),
      series: earnedSeries,
    },
    recurring: {
      mrr: byTier.basic.mrr + byTier.full.mrr,
      paying_subscribers: live.length,
      by_tier: byTier,
    },
    forecast: {
      total: forecastSeries.reduce((sum, point) => sum + point.amount, 0),
      series: forecastSeries,
    },
    trials: {
      in_progress: trials.length,
      ending_within_30_days: trials.filter((t) => t.end_date < soon).length,
      potential_mrr_min: prices.length ? trials.length * Math.min(...prices) : 0,
      potential_mrr_max: prices.length ? trials.length * Math.max(...prices) : 0,
    },
  }
}
