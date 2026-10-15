import cronConfig from '#config/cron'
import { cronScheduler } from '#services/cron/cron_scheduler'
import { registerCronTasks } from '#services/cron/register_tasks'
import logger from '@adonisjs/core/services/logger'

import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Service provider AdonisJS pour les tâches planifiées node-cron.
 *
 * Démarré uniquement dans l'environnement 'web' (serveur HTTP) une fois que
 * l'application est prête (`ready`), et arrêté proprement lors de l'extinction
 * (`shutdown`) pour libérer les timers de l'event loop Node.js.
 */
export default class CronProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    if (!cronConfig.enabled) {
      logger.info('Tâches cron désactivées par configuration (ENABLE_CRON_JOBS=false)')
      return
    }

    try {
      registerCronTasks(cronScheduler)
      cronScheduler.start()
      logger.info('Ordonnanceur node-cron initialisé et démarré')
    } catch (error) {
      logger.error({ err: error }, "Échec de l'initialisation de l'ordonnanceur node-cron")
    }
  }

  async shutdown() {
    try {
      cronScheduler.stop()
    } catch (error) {
      logger.error({ err: error }, "Échec de l'arrêt de l'ordonnanceur node-cron")
    }
  }
}
