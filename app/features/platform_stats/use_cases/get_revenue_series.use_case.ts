import { monthWindow } from '#features/bookings/booking_stats'

import type { RevenueSeriesDto } from '../dto/platform_stats.dto.ts'
import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'
import { buildRevenueSeries } from '../revenue_series.ts'

/** Série mensuelle du revenu de la plateforme, pour le graphique du tableau de bord. */
export class GetRevenueSeriesUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(input: { months?: number }, now: Date = new Date()): Promise<RevenueSeriesDto> {
    const months = Math.min(24, Math.max(1, input.months ?? 12))
    const first = monthWindow(now, -(months - 1))

    const bookings = await this.repo.bookingsTouching(first.from)
    const data = buildRevenueSeries(bookings, now, months)

    return { months, data, total: data.reduce((sum, point) => sum + point.revenue, 0) }
  }
}

export default GetRevenueSeriesUseCase
