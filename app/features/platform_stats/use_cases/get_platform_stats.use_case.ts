import {
  elapsedWindow,
  growthPercent,
  monthWindow,
  occupancyForWindow,
  revenueForMonth,
} from '#features/bookings/booking_stats'
import { exploitedUnits } from '#features/finance/occupancy'

import type { PlatformStatsDto } from '../dto/platform_stats.dto.ts'
import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'

/**
 * Tableau de bord du back-office.
 *
 * Revenu et occupation reprennent les fonctions du tableau de bord
 * propriétaire, appliquées à toute la plateforme : le chiffre d'affaires de la
 * plateforme reste ainsi la somme exacte de ceux des propriétaires.
 */
export class GetPlatformStatsUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(now: Date = new Date()): Promise<PlatformStatsDto> {
    const current = monthWindow(now)
    const previous = monthWindow(now, -1)

    const [counters, bookings] = await Promise.all([
      this.repo.counters(current.from),
      this.repo.bookingsTouching(previous.from),
    ])

    // La requête ne borne que la sortie : les séjours à venir au-delà du mois
    // en cours sont écartés ici.
    const inRange = bookings.filter((b) => b.start_date < current.to)

    const currentRevenue = revenueForMonth(inRange, current)
    const previousRevenue = revenueForMonth(inRange, previous)

    // Même parc exploité que le tableau de bord propriétaire : tout logement
    // qui n'est pas mis hors service.
    const exploited = exploitedUnits({
      total: counters.catalog.properties,
      inactive: counters.catalog.properties_by_status.inactive,
    })

    return {
      generated_at: now,
      ...counters,
      revenue: {
        current_month: currentRevenue,
        previous_month: previousRevenue,
        growth_percent: growthPercent(currentRevenue, previousRevenue),
      },
      occupancy_rate: occupancyForWindow(inRange, exploited, elapsedWindow(current, now)),
    }
  }
}

export default GetPlatformStatsUseCase
