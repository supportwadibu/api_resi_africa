import { filterByScope } from '#features/managers/scope'

import { aggregateGrossRevenue, aggregateRevenuePoints } from './repositories/finance_repository.ts'
import { daysWithinWindow } from './revenue_split.ts'

import type { RevenuePointDto } from './dto/finance.dto.ts'
import type { ActorScope } from '#features/managers/scope'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

/** Réservation réduite à ce que le relevé d'un gérant en lit. */
export interface ScopedBooking {
  property_id?: string | null
  start_date: Date
  end_date: Date
  total_amount: number
}

/** Dépense réduite à ce que le relevé d'un gérant en lit. */
export interface ScopedExpense {
  property_id?: string | null
  amount: number
}

/**
 * Relevé rendu à un gérant.
 *
 * Volontairement sans revenu net : le net déduit des charges qui ne relèvent
 * pas du gérant — abonnement du propriétaire, charges communes de la résidence,
 * dépenses portées par d'autres logements. Calculé sur un périmètre partiel, il
 * ne donnerait pas une marge partielle mais un chiffre faux, qui tromperait le
 * gérant sur la rentabilité du propriétaire.
 */
export interface ManagerOverviewDto {
  bookings_count: number
  gross_revenue: number
  expenses_total: number
  /** Part des jours-logement occupés sur la période, de 0 à 1. */
  occupancy_rate: number
  revenue_points: RevenuePointDto[]
}

/**
 * Part des jours-logement occupés sur la période.
 *
 * Rapport entre les jours réservés et la capacité du périmètre — le nombre de
 * logements confiés multiplié par la durée de la fenêtre. Le dénominateur peut
 * être nul : un gérant sans affectation, ou deux bornes confondues. Le taux
 * vaut alors zéro plutôt que l'infini ou `NaN`, qui remonteraient tels quels
 * jusqu'à l'écran.
 */
export function computeOccupancyRate(
  bookings: readonly ScopedBooking[],
  scope: ActorScope,
  from: Date,
  to: Date
): number {
  // Le propriétaire n'a pas de liste de logements : le dénominateur se déduit
  // alors des logements apparaissant dans la période. Approximation assumée —
  // le parc complet ne se lit pas ici, et cette fonction ne contacte rien.
  const propertiesCount =
    scope.propertyIds === null
      ? new Set(bookings.map((b) => b.property_id ?? '')).size
      : scope.propertyIds.length

  const windowDays = Math.floor((to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY)
  const capacity = propertiesCount * windowDays
  if (capacity <= 0) return 0

  const occupiedDays = bookings.reduce(
    (sum, booking) => sum + daysWithinWindow(booking.start_date, booking.end_date, from, to),
    0
  )

  // Plafonné à 1 : un séjour débordant la fenêtre donnerait sinon un taux
  // supérieur à 100 %, comme dans `FinanceRepository.occupancyRate`.
  return Math.min(1, occupiedDays / capacity)
}

/**
 * Construit le relevé d'un gérant sur son seul périmètre.
 *
 * Le filtrage est refait ici bien que les lectures soient déjà cloisonnées :
 * c'est la garantie de dernier recours si un appelant oubliait un jour de
 * transmettre le périmètre à la requête — même motif que le `where('owner_id')`
 * conservé dans les deux branches de filtrage.
 */
export function buildManagerOverview(input: {
  scope: ActorScope
  bookings: readonly ScopedBooking[]
  expenses: readonly ScopedExpense[]
  from: Date
  to: Date
}): ManagerOverviewDto {
  const bookings = filterByScope(input.bookings, input.scope)
  const expenses = filterByScope(input.expenses, input.scope)

  const range = { from: input.from, to: input.to }

  return {
    bookings_count: bookings.length,
    // Somme des tranches mensuelles, et non des `total_amount` entiers : un
    // séjour à cheval sur la borne n'impute à la fenêtre que sa part de jours,
    // et le chiffre clé reste ainsi égal au cumul du graphique.
    gross_revenue: aggregateGrossRevenue(bookings, range),
    expenses_total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    occupancy_rate: computeOccupancyRate(bookings, input.scope, input.from, input.to),
    revenue_points: aggregateRevenuePoints(bookings, range),
  }
}
