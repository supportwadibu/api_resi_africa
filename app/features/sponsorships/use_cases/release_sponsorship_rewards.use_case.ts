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
 *
 * Deux sources : le gain unique de l'ancien parrainage, porté par le
 * parrainage lui-même, et les gains récurrents de `sponsorship_rewards`.
 */
export class ReleaseSponsorshipRewardsUseCase {
  async execute(now: Date = new Date()): Promise<ReleaseSponsorshipRewardsResult> {
    const [legacy, recurring] = await Promise.all([
      this.releaseLegacy(await Sponsorship.listPending(), now),
      this.releaseRecurring(undefined, now),
    ])
    return {
      examined: legacy.examined + recurring.examined,
      released: legacy.released + recurring.released,
      failed: legacy.failed + recurring.failed,
    }
  }

  async forSponsor(
    sponsorId: string,
    records: SponsorshipRecord[],
    now: Date = new Date()
  ): Promise<number> {
    const [legacy, recurring] = await Promise.all([
      this.releaseLegacy(records, now),
      this.releaseRecurring(sponsorId, now),
    ])
    return legacy.released + recurring.released
  }

  private async releaseLegacy(
    records: SponsorshipRecord[],
    now: Date
  ): Promise<ReleaseSponsorshipRewardsResult> {
    const due = records.filter(
      (r) => r.status === 'pending' && r.available_at && r.available_at.getTime() <= now.getTime()
    )
    return this.run(
      due.map((r) => r._id),
      (id) => Sponsorship.release(id, now)
    )
  }

  private async releaseRecurring(
    sponsorId: string | undefined,
    now: Date
  ): Promise<ReleaseSponsorshipRewardsResult> {
    const pending = await Sponsorship.listPendingRewards(sponsorId)
    const due = pending.filter((r) => r.available_at.getTime() <= now.getTime())
    return this.run(
      due.map((r) => r._id),
      (id) => Sponsorship.releaseReward(id, now)
    )
  }

  private async run(
    ids: string[],
    release: (id: string) => Promise<boolean>
  ): Promise<ReleaseSponsorshipRewardsResult> {
    const result = { examined: ids.length, released: 0, failed: 0 }
    for (const id of ids) {
      try {
        if (await release(id)) result.released += 1
      } catch (error) {
        result.failed += 1
        logger.error({ err: error, reward_id: id }, 'Libération de gain en échec')
      }
    }
    return result
  }
}

export default ReleaseSponsorshipRewardsUseCase
