import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/** Sondes appelées chaque minute par un moniteur : du bruit à `info`. */
const QUIET_PATHS = new Set(['/health', '/api/v1/health'])

/**
 * Une ligne de journal par requête, au niveau qui dit sa gravité : `warn`
 * pour un refus d'accès ou une limite atteinte — ce qu'une surveillance doit
 * compter —, `error` pour une panne serveur.
 *
 * Le chemin est journalisé **sans** sa chaîne de requête : les routes `cron`
 * acceptent leur secret en `?secret=`, et les journaux ne sont pas un lieu
 * pour un secret.
 */
export default class RequestLoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const startedAt = process.hrtime.bigint()

    try {
      await next()
    } finally {
      // Le handler d'exceptions a déjà posé le statut quand `next()` rend la
      // main, y compris après une exception.
      const status = ctx.response.getStatus()
      const path = ctx.request.url()
      const entry = {
        request_id: ctx.request.id(),
        method: ctx.request.method(),
        path,
        route: ctx.route?.pattern ?? null,
        status,
        duration_ms: Number((process.hrtime.bigint() - startedAt) / 1_000_000n),
        user_id: ctx.authUser?.id ?? null,
        ip: ctx.request.ip(),
      }

      if (status >= 500) {
        ctx.logger.error(entry, 'Requête en erreur serveur')
      } else if (status === 401 || status === 403 || status === 429) {
        ctx.logger.warn(entry, 'Requête refusée')
      } else if (!QUIET_PATHS.has(path)) {
        ctx.logger.info(entry, 'Requête traitée')
      }
    }
  }
}
