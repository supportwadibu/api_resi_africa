import logger from '@adonisjs/core/services/logger'

import Sponsorship, { type SponsorshipRecord } from '#models/sponsorship'

export interface ReleaseSponsorshipRewardsResult {
  examined: number
  released: number
  failed: number
}

/**
 * Rend disponibles les gains sortis de leur délai d'attente.
 *
 * Appelé par l'ordonnanceur (`/cron/sponsorship-rewards`), et à chaque
 * ouverture de l'écran Parrainage pour les gains de ce parrain : un
 * ordonnanceur en retard ne prive personne d'un gain échu. Idempotent — un
 * gain déjà libéré n'est plus `pending`.
 */
export class ReleaseSponsorshipRewardsUseCase {
  async execute(now: Date = new Date()): Promise<ReleaseSponsorshipRewardsResult> {
    return this.releaseAll(await Sponsorship.listPending(), now)
  }

  async forSponsor(records: SponsorshipRecord[], now: Date = new Date()): Promise<number> {
    const result = await this.releaseAll(records, now)
    return result.released
  }

  private async releaseAll(
    records: SponsorshipRecord[],
    now: Date
  ): Promise<ReleaseSponsorshipRewardsResult> {
    const due = records.filter(
      (r) => r.status === 'pending' && r.available_at && r.available_at.getTime() <= now.getTime()
    )
    const result = { examined: due.length, released: 0, failed: 0 }

    for (const record of due) {
      try {
        if (await Sponsorship.release(record._id, now)) result.released += 1
      } catch (error) {
        result.failed += 1
        logger.error({ err: error, sponsorship_id: record._id }, 'Libération de gain en échec')
      }
    }
    return result
  }
}

export default ReleaseSponsorshipRewardsUseCase
