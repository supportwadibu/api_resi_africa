import cron, { type ScheduledTask } from 'node-cron'

import cronConfig from '#config/cron'
import logger from '@adonisjs/core/services/logger'

export interface CronTaskDefinition {
  name: string
  cronExpression: string
  handler: () => Promise<unknown>
  timezone?: string
}

export interface RegisteredCronTask extends CronTaskDefinition {
  scheduledTask: ScheduledTask | null
  isRunning: boolean
}

export interface CronTaskStatus {
  name: string
  cronExpression: string
  isRunning: boolean
  isScheduled: boolean
}

/**
 * Ordonnanceur interne basé sur node-cron.
 *
 * Gère l'enregistrement, la planification, la prévention des chevauchements
 * et l'arrêt propre des tâches périodiques du backend.
 */
export class CronScheduler {
  private tasks = new Map<string, RegisteredCronTask>()

  /**
   * Enregistre une tâche planifiée. Valide l'expression cron avant stockage.
   */
  register(definition: CronTaskDefinition): this {
    if (!cron.validate(definition.cronExpression)) {
      throw new Error(
        `Expression cron invalide pour la tâche "${definition.name}" : "${definition.cronExpression}"`
      )
    }

    const existing = this.tasks.get(definition.name)
    if (existing?.scheduledTask) {
      existing.scheduledTask.stop()
    }

    this.tasks.set(definition.name, {
      ...definition,
      scheduledTask: null,
      isRunning: false,
    })

    return this
  }

  /**
   * Démarre toutes les tâches planifiées enregistrées.
   */
  start(): void {
    const defaultTimezone = cronConfig.timezone

    for (const task of this.tasks.values()) {
      if (task.scheduledTask) {
        task.scheduledTask.stop()
      }

      const timezone = task.timezone ?? defaultTimezone

      task.scheduledTask = cron.schedule(
        task.cronExpression,
        () => {
          void this.runTask(task.name).catch((error) => {
            // L'erreur est déjà journalisée dans runTask ; on absorbe ici
            // pour ne jamais laisser une promesse rejetée non gérée dans l'event loop.
            logger.debug({ task: task.name, err: error }, 'Erreur absorbée au niveau du tick cron')
          })
        },
        {
          timezone,
          name: task.name,
          noOverlap: true,
        }
      )

      logger.info(
        { task: task.name, schedule: task.cronExpression, timezone },
        `Tâche cron planifiée : ${task.name}`
      )
    }
  }

  /**
   * Exécute une tâche spécifique avec verrou anti-chevauchement et mesure de durée.
   */
  async runTask(name: string): Promise<unknown> {
    const task = this.tasks.get(name)
    if (!task) {
      throw new Error(`Tâche cron introuvable : "${name}"`)
    }

    // Évite qu'une exécution lente se chevauche avec le tick suivant.
    if (task.isRunning) {
      logger.warn(
        { task: task.name },
        `Cron : exécution précédente de "${task.name}" toujours en cours, tick ignoré`
      )
      return null
    }

    task.isRunning = true
    const startedAt = Date.now()

    try {
      const result = await task.handler()
      const durationMs = Date.now() - startedAt

      logger.info(
        {
          task: task.name,
          duration_ms: durationMs,
          ...(typeof result === 'object' && result !== null ? result : {}),
        },
        `Cron : exécution réussie (${task.name})`
      )

      return result
    } catch (error) {
      const durationMs = Date.now() - startedAt

      logger.error(
        { task: task.name, duration_ms: durationMs, err: error },
        `Cron : échec de l'exécution (${task.name})`
      )

      throw error
    } finally {
      task.isRunning = false
    }
  }

  /**
   * Arrête toutes les tâches en cours de planification.
   */
  stop(): void {
    for (const task of this.tasks.values()) {
      if (task.scheduledTask) {
        task.scheduledTask.stop()
        task.scheduledTask = null
      }
    }
    logger.info('Toutes les tâches cron ont été arrêtées')
  }

  /**
   * Retourne l'état de chaque tâche enregistrée.
   */
  getTasks(): CronTaskStatus[] {
    return Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      cronExpression: task.cronExpression,
      isRunning: task.isRunning,
      isScheduled: task.scheduledTask !== null,
    }))
  }

  /**
   * Réinitialise toutes les tâches (utile pour réinitialiser le scheduler en test).
   */
  clear(): void {
    this.stop()
    this.tasks.clear()
  }
}

export const cronScheduler = new CronScheduler()
