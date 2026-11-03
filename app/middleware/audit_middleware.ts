import AuditLog from '#models/audit_log'
import logger from '@adonisjs/core/services/logger'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Piste d'audit des écritures sensibles. À placer après `auth()`.
 *
 * Seules les écritures sont tracées : une lecture ne change rien, et la
 * tracer multiplierait les documents sans répondre à une question utile. Un
 * refus est tracé lui aussi — une suite de 403 sur des retraits dit autant
 * qu'un succès.
 */
export default class AuditMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (READ_METHODS.has(ctx.request.method())) return next()

    // Une `DomainError` levée plus bas est déjà convertie en réponse quand
    // `next()` rend la main : le statut lu ici est celui du client.
    await next()
    await this.record(ctx, ctx.response.getStatus())
  }

  /**
   * Une panne d'écriture de la trace ne doit pas annuler l'opération, déjà
   * faite : elle est signalée dans les journaux, où la même information
   * subsiste.
   */
  private async record(ctx: HttpContext, status: number): Promise<void> {
    const entry = {
      actor_id: ctx.authUser?.id ?? null,
      actor_role: ctx.authUser?.role ?? null,
      action: `${ctx.request.method()} ${ctx.route?.pattern ?? ctx.request.url()}`,
      params: Object.fromEntries(
        Object.entries(ctx.params ?? {}).map(([key, value]) => [key, String(value)])
      ),
      status,
      ip_address: ctx.request.ip(),
      user_agent: ctx.request.header('user-agent') ?? 'unknown',
      request_id: ctx.request.id() ?? null,
    }

    try {
      await AuditLog.create(entry)
    } catch (error) {
      logger.error({ err: error, audit: entry }, "Échec d'écriture de la piste d'audit")
    }
  }
}
