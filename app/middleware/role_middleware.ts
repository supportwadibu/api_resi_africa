import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Garde par rôle. À utiliser après le middleware d'authentification JWT,
 * qui doit avoir alimenté `ctx.authUser.role`.
 *
 * Exemple : router.get('/...', [...]).use([middleware.auth(), middleware.role(['admin'])])
 */
export default class RoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, allowedRoles: string[]) {
    const user = ctx.authUser
    if (!user) {
      return ctx.response.unauthorized({
        code: 'unauthenticated',
        message: 'Authentification requise.',
      })
    }

    if (!allowedRoles.includes(user.role)) {
      return ctx.response.forbidden({
        code: 'forbidden_role',
        message: 'Accès refusé pour ce rôle.',
      })
    }

    return next()
  }
}
