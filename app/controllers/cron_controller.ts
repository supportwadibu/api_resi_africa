import logger from '@adonisjs/core/services/logger'

import type { HttpContext } from '@adonisjs/core/http'

import { SuspendUnverifiedOwnersUseCase } from '../features/subscriptions/use_cases/index.ts'

/**
 * Tâches planifiées déclenchées par un ordonnanceur externe.
 *
 * Render ne propose les Cron Jobs que sur ses offres payantes : les mêmes
 * traitements sont donc exposés en HTTP, à appeler depuis un service comme
 * cron-job.org. La logique reste dans les use cases, partagée avec les
 * commandes ace — ces routes n'en sont qu'un déclencheur supplémentaire.
 *
 * L'accès est gardé par `middleware.cron()` : secret partagé obligatoire.
 */
export default class CronController {
  /**
   * POST|GET /api/v1/cron/expire-trials
   *
   * Expire les essais échus et suspend les propriétaires non validés.
   * Idempotent : rejouer l'appel ne suspend jamais deux fois le même compte,
   * ce qui rend inoffensifs les réessais d'un ordonnanceur.
   *
   * GET est accepté en plus de POST : beaucoup d'ordonnanceurs gratuits, dont
   * cron-job.org, n'émettent que des GET.
   */
  async expireTrials(ctx: HttpContext) {
    const startedAt = Date.now()
    const result = await new SuspendUnverifiedOwnersUseCase().execute()

    // Trace côté serveur : l'ordonnanceur ne conserve souvent que le code HTTP,
    // et ces suspensions doivent rester explicables après coup.
    logger.info({ ...result, duration_ms: Date.now() - startedAt }, 'Cron : essais expirés')

    return ctx.response.ok({
      task: 'expire-trials',
      ...result,
      duration_ms: Date.now() - startedAt,
    })
  }

  /**
   * GET /api/v1/cron/health
   *
   * Sonde de disponibilité. Utile pour maintenir éveillée une instance Render
   * gratuite, qui s'endort après quinze minutes d'inactivité — un essai ne doit
   * pas rester ouvert simplement parce que le serveur dormait à l'heure dite.
   */
  async health(ctx: HttpContext) {
    return ctx.response.ok({ status: 'ok', time: new Date().toISOString() })
  }
}
