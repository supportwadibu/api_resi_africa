import logger from '@adonisjs/core/services/logger'

import BookingRepository from '../repositories/booking_repository.ts'
import { resolveStayTransition } from '../stay_status.ts'

export interface SyncStayStatusesResult {
  /** Séjours ouverts examinés. */
  examined: number
  /** Réservations confirmées passées « en cours » à l'heure d'arrivée. */
  started: number
  /** Séjours clos après leur sortie prévue. */
  completed: number
  /** Séjours modifiés entre la lecture et l'écriture : laissés en l'état. */
  skipped: number
  /** Écritures en échec, rejouées au prochain appel. */
  failed: number
}

/**
 * Met les statuts des séjours à l'heure : arrivée passée → « en cours »,
 * sortie passée (délai de grâce compris) → « terminé ».
 *
 * Appelé par l'ordonnanceur externe (`/cron/stay-statuses`), aussi souvent
 * qu'il le veut : un séjour déjà basculé n'est plus candidat, l'opération est
 * idempotente.
 */
export class SyncStayStatusesUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  async execute(now: Date = new Date()): Promise<SyncStayStatusesResult> {
    const open = await this.repo.findOpenStays()
    const result: SyncStayStatusesResult = {
      examined: open.length,
      started: 0,
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

        if (!applied) result.skipped += 1
        else if (transition.status === 'completed') result.completed += 1
        else result.started += 1
      } catch (error) {
        result.failed += 1
        logger.error({ err: error, booking_id: booking._id }, 'Bascule de statut en échec')
      }
    }

    return result
  }
}

export default SyncStayStatusesUseCase
