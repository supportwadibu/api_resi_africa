import env from '#start/env'
import crypto from 'node:crypto'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Garde des routes de tâches planifiées.
 *
 * Ces routes sont appelées par un ordonnanceur externe (cron-job.org, Cloud
 * Scheduler) qui ne peut présenter aucun JWT : un secret partagé tient lieu
 * d'authentification. Il est accepté dans l'en-tête `X-Cron-Secret` ou, pour
 * les ordonnanceurs qui ne savent pas envoyer d'en-tête personnalisé, dans le
 * paramètre de requête `?secret=`.
 *
 * Contrairement à la vérification de signature Wave, l'absence de secret
 * configuré **refuse** l'accès au lieu de l'autoriser : ces routes déclenchent
 * des écritures en masse (suspension de comptes), les laisser ouvertes par
 * défaut d'configuration offrirait un déni de service trivial.
 */
export default class CronMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const expected = env.get('CRON_SECRET')

    if (!expected) {
      return ctx.response.serviceUnavailable({
        code: 'cron_not_configured',
        message: 'Les tâches planifiées ne sont pas configurées sur le serveur.',
      })
    }

    const header = ctx.request.header('x-cron-secret')
    const query = ctx.request.qs().secret
    const provided = header ?? (typeof query === 'string' ? query : undefined)

    if (!provided || !this.matches(expected, provided)) {
      return ctx.response.unauthorized({
        code: 'invalid_cron_secret',
        message: 'Secret invalide.',
      })
    }

    return next()
  }

  /**
   * Comparaison à temps constant.
   *
   * `timingSafeEqual` exige des longueurs identiques et lève sinon ; le test
   * préalable évite l'exception, au prix d'une fuite de la longueur du secret —
   * sans conséquence pratique.
   */
  private matches(expected: string, provided: string): boolean {
    if (expected.length !== provided.length) return false
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  }
}
