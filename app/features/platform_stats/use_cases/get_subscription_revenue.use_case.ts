import { monthWindow } from '#features/bookings/booking_stats'

import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'
import { buildSubscriptionRevenue, type SubscriptionRevenueDto } from '../subscription_revenue.ts'

/**
 * Revenu de RESI : ce que les abonnements ont rapporté, et ce qu'ils devraient
 * rapporter si les abonnés en cours renouvellent.
 */
export class GetSubscriptionRevenueUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(
    input: { months_back?: number; months_ahead?: number },
    now: Date = new Date()
  ): Promise<SubscriptionRevenueDto> {
    const monthsBack = Math.min(24, Math.max(1, input.months_back ?? 12))
    const monthsAhead = Math.min(12, Math.max(1, input.months_ahead ?? 6))

    const inputs = await this.repo.subscriptionRevenueInputs(
      monthWindow(now, -(monthsBack - 1)).from
    )

    return buildSubscriptionRevenue({ ...inputs, now, monthsBack, monthsAhead })
  }
}

export default GetSubscriptionRevenueUseCase
