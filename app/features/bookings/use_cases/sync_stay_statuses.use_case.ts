import logger from '@adonisjs/core/services/logger'

import { QualifySponsorshipUseCase } from '#features/sponsorships/use_cases/qualify_sponsorship.use_case'

import BookingRepository from '../repositories/booking_repository.ts'
import { resolveStayTransition } from '../stay_status.ts'

export interface SyncStayStatusesResult {
  /** Séjours ouverts examinés. */
  examined: number
  /** Séjours clos après leur sortie prévue. */
  completed: number
  /** Séjours modifiés entre la lecture et l'écriture : laissés en l'état. */
  skipped: number
  /** Écritures en échec, rejouées au prochain appel. */
  failed: number
}

/**
 * Clôt les séjours dont la sortie est passée (délai de grâce compris).
 * L'arrivée ne bascule plus seule : voir `resolveStayTransition`.
 *
 * Appelé par l'ordonnanceur externe (`/cron/stay-statuses`), aussi souvent
 * qu'il le veut : un séjour déjà basculé n'est plus candidat, l'opération est
 * idempotente.
 */
export class SyncStayStatusesUseCase {
  constructor(
    private repo: BookingRepository = new BookingRepository(),
    private sponsorships: Pick<
      QualifySponsorshipUseCase,
      'onBookingCompleted'
    > = new QualifySponsorshipUseCase()
  ) {}

  async execute(now: Date = new Date()): Promise<SyncStayStatusesResult> {
    const open = await this.repo.findOpenStays()
    const result: SyncStayStatusesResult = {
      examined: open.length,
      completed: 0,
      skipped: 0,
      failed: 0,
    }

    for (const booking of open) {
      const transition = resolveStayTransition(booking, now)
      if (!transition) continue

      // Un échec isolé ne doit pas interrompre le lot : le séjour suivant n'a
      // pas à pâtir d'un document corrompu, et celui-ci sera repris au
      // prochain appel.
      try {
        const applied = await this.repo.applyStatusTransition(
          booking._id,
          booking.status,
          transition
        )

        if (!applied) {
          result.skipped += 1
        } else {
          result.completed += 1
          if (transition.status === 'completed') {
            await this.sponsorships.onBookingCompleted(
              {
                id: booking._id,
                client_id: booking.client_id,
                owner_id: booking.owner_id,
                source: booking.source,
                total_amount: booking.total_amount,
                sponsorship_credit_amount: booking.sponsorship_credit_amount,
              },
              now
            )
          }
        }
      } catch (error) {
        result.failed += 1
        logger.error({ err: error, booking_id: booking._id }, 'Bascule de statut en échec')
      }
    }

    return result
  }
}

export default SyncStayStatusesUseCase
