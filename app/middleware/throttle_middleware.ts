import { RateLimiter } from '#utils/rate_limiter'
import logger from '@adonisjs/core/services/logger'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export interface ThrottleOptions {
  /** Espace de compteurs : deux groupes de même nom partagent leur quota. */
  name: string
  max: number
  /** Durée de la fenêtre, en secondes. */
  window: number
  /**
   * `ip` pour les routes publiques ; `user` derrière `auth()`, où l'IP serait
   * trompeuse — au comptoir comme sur le réseau mobile, des centaines
   * d'abonnés sortent par la même adresse (CGNAT).
   */
  by?: 'ip' | 'user'
}

/** Partagé par toutes les routes : un compteur par `name` et par appelant. */
const limiter = new RateLimiter()

/**
 * Limite de débit par appelant.
 *
 * Répond `429 rate_limited` — le code déjà émis par `assertRateLimit`, que le
 * mobile et le back-office savent lire — avec `Retry-After`.
 *
 * L'IP n'est fiable que si `TRUST_PROXY` décrit le proxy de l'hébergeur : sans
 * cela, tous les clients partagent l'adresse du proxy, donc le même quota.
 */
export default class ThrottleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: ThrottleOptions) {
    const by = options.by ?? 'ip'
    const caller =
      by === 'user' && ctx.authUser?.id ? `u:${ctx.authUser.id}` : `ip:${ctx.request.ip()}`
    const result = limiter.hit(`${options.name}:${caller}`, options.max, options.window * 1000)

    ctx.response.header('X-RateLimit-Limit', String(result.limit))
    ctx.response.header('X-RateLimit-Remaining', String(result.remaining))

    if (!result.allowed) {
      // Une seule trace par fenêtre : journaliser chaque refus d'une rafale
      // noierait les journaux sous l'attaque même qu'ils doivent signaler.
      if (limiter.hit(`log:${options.name}:${caller}`, 1, options.window * 1000).allowed) {
        logger.warn(
          {
            throttle: options.name,
            caller,
            route: ctx.route?.pattern,
            request_id: ctx.request.id(),
          },
          'Limite de débit atteinte'
        )
      }

      ctx.response.header('Retry-After', String(result.retryAfterSeconds))
      return ctx.response.tooManyRequests({
        code: 'rate_limited',
        message: `Trop de requêtes. Réessayez dans ${result.retryAfterSeconds} secondes.`,
      })
    }

    return next()
  }
}
