import { DomainError } from '#utils/domain_error'

/**
 * Chiffre d'affaires de RESI, sans Firestore : testé seul.
 *
 * Ce que RESI garde, et non l'argent qui transite par elle pour le compte des
 * propriétaires :
 * - `commissions` : sur chaque paiement de réservation, ce que le client a
 *   réglé moins la part du propriétaire. Constatée le jour du paiement,
 *   reprise le jour d'un remboursement ;
 * - `subscriptions` : les abonnements payés par les propriétaires ;
 * - `withdrawal_fees` : les frais des retraits versés ;
 * - `sponsorship_rewards` : les gains de parrainage devenus disponibles, en
 *   négatif — c'est RESI qui les paie.
 *
 * Calculé à la lecture depuis les collections sources plutôt que tenu dans un
 * journal à part : un seul endroit fait foi, et rien n'est à rattraper.
 */

export const REVENUE_GRANULARITIES = ['day', 'week', 'month'] as const
export type RevenueGranularity = (typeof REVENUE_GRANULARITIES)[number]

export const REVENUE_SOURCES = [
  'commissions',
  'subscriptions',
  'withdrawal_fees',
  'sponsorship_rewards',
] as const
export type RevenueSource = (typeof REVENUE_SOURCES)[number]

/** Mouvement signé : positif quand RESI gagne, négatif quand elle rend ou paie. */
export interface RevenueEvent {
  source: RevenueSource
  amount: number
  at: Date
}

export type RevenueTotals = Record<RevenueSource, number> & { net: number }

export interface RevenuePeriodDto extends RevenueTotals {
  /** `AAAA-MM-JJ` du premier jour de la période, en UTC. */
  period: string
}

export interface PlatformRevenueDto {
  from: Date
  /** Exclu. */
  to: Date
  granularity: RevenueGranularity
  totals: RevenueTotals
  /** Réservations payées sur la période qui ont rapporté une commission. */
  commissioned_bookings: number
  series: RevenuePeriodDto[]
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Périodes au plus dans une série : un an au jour près, cinq ans au mois. */
const MAX_PERIODS = 400

/** Début de la période contenant `date`, en UTC. La semaine commence le lundi. */
export function periodStart(date: Date, granularity: RevenueGranularity): Date {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  if (granularity === 'day') return new Date(day)
  if (granularity === 'month')
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const weekday = (new Date(day).getUTCDay() + 6) % 7
  return new Date(day - weekday * DAY_MS)
}

function nextPeriod(start: Date, granularity: RevenueGranularity): Date {
  if (granularity === 'day') return new Date(start.getTime() + DAY_MS)
  if (granularity === 'week') return new Date(start.getTime() + 7 * DAY_MS)
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
}

function emptyTotals(): RevenueTotals {
  return { commissions: 0, subscriptions: 0, withdrawal_fees: 0, sponsorship_rewards: 0, net: 0 }
}

function add(totals: RevenueTotals, event: RevenueEvent) {
  totals[event.source] += event.amount
  totals.net += event.amount
}

/** Vérifie la fenêtre demandée : bornes dans l'ordre, série de taille raisonnable. */
export function assertRevenueWindow(from: Date, to: Date, granularity: RevenueGranularity) {
  if (to.getTime() <= from.getTime()) {
    throw new DomainError('invalid_period', 'La fin de la période doit suivre son début.', 422)
  }
  let count = 0
  for (
    let start = periodStart(from, granularity);
    start < to;
    start = nextPeriod(start, granularity)
  ) {
    if (++count > MAX_PERIODS) {
      throw new DomainError(
        'invalid_period',
        'Période trop longue pour ce découpage : choisissez la semaine ou le mois.',
        422
      )
    }
  }
}

export function buildPlatformRevenue(
  events: readonly RevenueEvent[],
  from: Date,
  to: Date,
  granularity: RevenueGranularity
): PlatformRevenueDto {
  const series: RevenuePeriodDto[] = []
  const index = new Map<number, RevenuePeriodDto>()
  for (
    let start = periodStart(from, granularity);
    start < to;
    start = nextPeriod(start, granularity)
  ) {
    const point = { period: start.toISOString().slice(0, 10), ...emptyTotals() }
    series.push(point)
    index.set(start.getTime(), point)
  }

  const totals = emptyTotals()
  let commissioned = 0
  for (const event of events) {
    if (event.at < from || event.at >= to || event.amount === 0) continue
    add(totals, event)
    const point = index.get(periodStart(event.at, granularity).getTime())
    if (point) add(point, event)
    if (event.source === 'commissions' && event.amount > 0) commissioned += 1
  }

  return { from, to, granularity, totals, commissioned_bookings: commissioned, series }
}

/** Ce que la commission lit d'un paiement de réservation. */
export interface CommissionPayment {
  status: string
  paid_at: Date | null
  refunded_at?: Date | null
  /** Commission du paiement, voir `commissionOfPayment` — signée ici. */
  commission: number
}

/**
 * Mouvements d'un paiement de réservation : la commission le jour du
 * paiement, reprise le jour du remboursement. Un paiement remboursé garde sa
 * commission sur sa période d'origine : un mois clos ne bouge pas.
 */
export function commissionEvents(payment: CommissionPayment): RevenueEvent[] {
  if (!payment.paid_at || payment.commission === 0) return []
  if (payment.status !== 'success' && payment.status !== 'refunded') return []

  const events: RevenueEvent[] = [
    { source: 'commissions', amount: payment.commission, at: payment.paid_at },
  ]
  if (payment.status === 'refunded' && payment.refunded_at) {
    events.push({ source: 'commissions', amount: -payment.commission, at: payment.refunded_at })
  }
  return events
}
