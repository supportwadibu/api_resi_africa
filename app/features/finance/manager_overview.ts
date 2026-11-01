import { elapsedWindow } from '#features/bookings/booking_stats'
import { filterByScope } from '#features/managers/scope'

import {
  aggregateGrossRevenue,
  aggregateRevenuePoints,
  retainedDepositsAsRevenue,
} from './repositories/finance_repository.ts'
import { occupancyRate } from './occupancy.ts'

import type { RevenuePointDto } from './dto/finance.dto.ts'
import type { ActorScope } from '#features/managers/scope'
// Dépense réduite à ses rattachements et à son montant. Reprise de
// `residence_scope` plutôt que redéclarée : deux `ScopedExpense` de formes
// divergentes dans la même feature laisseraient croire à deux notions.
import type { ScopedExpense } from './residence_scope.ts'

/** Réservation réduite à ce que le relevé d'un gérant en lit. */
export interface ScopedBooking {
  property_id?: string | null
  start_date: Date
  end_date: Date
  total_amount: number
  days_count?: number
  nights_count?: number
  stay_type?: string
}

/** Annulation dont l'acompte a été gardé : un encaissement sans séjour. */
export interface ScopedRetainedCancellation {
  property_id?: string | null
  cancelled_at: Date | null
  retained_amount?: number
}

export type { ScopedExpense }

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
 * logements exploités multiplié par la durée de la fenêtre. Le dénominateur
 * peut être nul : un gérant sans affectation, ou deux bornes confondues. Le
 * taux vaut alors zéro plutôt que l'infini ou `NaN`, qui remonteraient tels
 * quels jusqu'à l'écran.
 *
 * `exploitedUnits` est le parc compté comme chez le propriétaire
 * (`exploitedUnits` de `occupancy.ts`) : les logements confiés, moins ceux mis
 * hors service. Compter un logement `inactive` au dénominateur faisait lire au
 * gérant un taux plus bas que celui du propriétaire sur le même parc. Les
 * replis ne servent qu'à un appelant qui ne l'a pas lu.
 */
export function computeOccupancyRate(
  bookings: readonly ScopedBooking[],
  scope: ActorScope,
  from: Date,
  to: Date,
  exploitedUnits?: number
): number {
  // Le propriétaire n'a pas de liste de logements : le dénominateur se déduit
  // alors des logements apparaissant dans la période. Approximation assumée —
  // le parc complet ne se lit pas ici, et cette fonction ne contacte rien.
  const propertiesCount =
    exploitedUnits ??
    (scope.propertyIds === null
      ? new Set(bookings.map((b) => b.property_id ?? '')).size
      : scope.propertyIds.length)

  // Même formule que le relevé du propriétaire : voir `occupancy.ts`. Le
  // relevé gérant comptait chaque séjour pour un jour plein quel que soit son
  // type, et arrondissait au jour entamé — deux taux différents pour le même
  // logement selon qui le lisait.
  return occupancyRate(bookings, propertiesCount, from, to)
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
  /** Annulations à acompte gardé de la fenêtre. */
  retained?: readonly ScopedRetainedCancellation[]
  /** Logements exploités du périmètre, dénominateur du taux d'occupation. */
  exploitedUnits?: number
  from: Date
  to: Date
  /** Instant de référence du taux d'occupation ; injectable pour les tests. */
  now?: Date
}): ManagerOverviewDto {
  const bookings = filterByScope(input.bookings, input.scope)
  const expenses = filterByScope(input.expenses, input.scope)

  const range = { from: input.from, to: input.to }

  // Acomptes gardés : encaissés, ils comptent au brut et au graphique, comme
  // chez le propriétaire — jamais à l'occupation ni au nombre de séjours. Sans
  // eux, un gérant qui annule en gardant l'acompte voyait l'argent encaissé
  // manquer à son relevé alors que celui du propriétaire le portait.
  const revenueBookings = [
    ...bookings,
    ...retainedDepositsAsRevenue(filterByScope(input.retained ?? [], input.scope)),
  ]

  return {
    bookings_count: bookings.length,
    // Somme des tranches mensuelles, et non des `total_amount` entiers : un
    // séjour à cheval sur la borne n'impute à la fenêtre que sa part de jours,
    // et le chiffre clé reste ainsi égal au cumul du graphique.
    gross_revenue: aggregateGrossRevenue(revenueBookings, range),
    expenses_total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    // Jours écoulés seulement, comme le relevé du propriétaire : voir
    // `elapsedWindow`.
    occupancy_rate: (() => {
      const elapsed = elapsedWindow(range, input.now ?? new Date())
      return computeOccupancyRate(
        bookings,
        input.scope,
        elapsed.from,
        elapsed.to,
        input.exploitedUnits
      )
    })(),
    revenue_points: aggregateRevenuePoints(revenueBookings, range),
  }
}
