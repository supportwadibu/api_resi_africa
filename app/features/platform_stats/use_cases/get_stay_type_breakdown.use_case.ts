import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'
import {
  buildStayBuckets,
  stayBreakdownWindow,
  type StayTypeBreakdownDto,
} from '../stay_type_breakdown.ts'

/**
 * Types de séjour les plus vendus sur les `months` derniers mois, mois en
 * cours compris, ou entre deux dates — de toute la plateforme ou d'un seul
 * propriétaire.
 *
 * Une réservation compte au mois où le séjour commence : c'est le choix du
 * client qu'on mesure, pas l'occupation, que le prorata du chiffre d'affaires
 * couvre déjà.
 */
export class GetStayTypeBreakdownUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(
    input: { months?: number; from?: Date; to?: Date; owner_id?: string },
    now: Date = new Date()
  ): Promise<StayTypeBreakdownDto> {
    const window = stayBreakdownWindow(input, now)
    const ownerId = input.owner_id ?? null

    const bookings = await this.repo.bookingsStartedSince(window.from, ownerId, window.until)

    return {
      months: window.months,
      from: window.from,
      to: window.until ? new Date(window.until.getTime() - 24 * 60 * 60 * 1000) : null,
      owner_id: ownerId,
      total_bookings: bookings.length,
      buckets: buildStayBuckets(bookings),
    }
  }
}

export default GetStayTypeBreakdownUseCase
