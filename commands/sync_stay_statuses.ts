import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Clôt les séjours dont la sortie prévue et son délai de grâce sont passés.
 * L'arrivée, elle, s'enregistre au comptoir.
 *
 *     node ace bookings:sync-statuses
 *
 * Même traitement que `GET /api/v1/cron/stay-statuses`, pour un hébergeur qui
 * sait planifier une commande. Idempotente.
 */
export default class SyncStayStatuses extends BaseCommand {
  static commandName = 'bookings:sync-statuses'
  static description = 'Clôt les séjours dont la sortie est passée'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { SyncStayStatusesUseCase } =
      await import('#features/bookings/use_cases/sync_stay_statuses.use_case')

    const result = await new SyncStayStatusesUseCase().execute()

    this.logger.info(
      `${result.examined} séjour(s) ouvert(s) examiné(s) — ` +
        `${result.completed} clos, ` +
        `${result.skipped} modifié(s) entre-temps, ${result.failed} en échec.`
    )
  }
}
