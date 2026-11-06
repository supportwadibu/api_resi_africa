import { monthWindow } from '#features/bookings/booking_stats'

import PlatformStatsRepository from '../repositories/platform_stats_repository.ts'
import { buildStayBuckets, type StayTypeBreakdownDto } from '../stay_type_breakdown.ts'

/**
 * Types de séjour les plus vendus sur les `months` derniers mois, mois en
 * cours compris — de toute la plateforme ou d'un seul propriétaire.
 *
 * Une réservation compte au mois où le séjour commence : c'est le choix du
 * client qu'on mesure, pas l'occupation, que le prorata du chiffre d'affaires
 * couvre déjà.
 */
export class GetStayTypeBreakdownUseCase {
  constructor(private repo: PlatformStatsRepository = new PlatformStatsRepository()) {}

  async execute(
    input: { months?: number; owner_id?: string },
    now: Date = new Date()
  ): Promise<StayTypeBreakdownDto> {
    const months = Math.min(24, Math.max(1, input.months ?? 12))
    const from = monthWindow(now, -(months - 1)).from
    const ownerId = input.owner_id ?? null

    const bookings = await this.repo.bookingsStartedSince(from, ownerId)

    return {
      months,
      from,
      owner_id: ownerId,
      total_bookings: bookings.length,
      buckets: buildStayBuckets(bookings),
    }
  }
}

export default GetStayTypeBreakdownUseCase
