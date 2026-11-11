import {
  assertRevenueWindow,
  buildPlatformRevenue,
  type PlatformRevenueDto,
  type RevenueGranularity,
} from '../platform_revenue.ts'
import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'

export interface GetPlatformRevenueInput {
  from?: Date
  /** Exclu. */
  to?: Date
  granularity?: RevenueGranularity
}

/**
 * Chiffre d'affaires de RESI sur une période, découpé par jour, semaine ou
 * mois. Sans période : l'année en cours, mois par mois.
 */
export class GetPlatformRevenueUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(
    input: GetPlatformRevenueInput,
    now: Date = new Date()
  ): Promise<PlatformRevenueDto> {
    const from = input.from ?? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const to = input.to ?? now
    const granularity = input.granularity ?? 'month'
    assertRevenueWindow(from, to, granularity)

    const events = await this.repo.platformRevenueEvents(from)
    return buildPlatformRevenue(events, from, to, granularity)
  }
}

export default GetPlatformRevenueUseCase
