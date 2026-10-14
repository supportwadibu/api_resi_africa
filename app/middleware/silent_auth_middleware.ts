import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * @deprecated Plus utilisé. Conservé en no-op pour ne pas casser d'éventuelles
 * références. À supprimer.
 */
export default class SilentAuthMiddleware {
  async handle(_ctx: HttpContext, next: NextFn) {
    return next()
  }
}
