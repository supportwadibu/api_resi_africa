import ManagerAssignment from '#models/manager_assignment'
import resolveActorScope from '#features/managers/use_cases/resolve_actor_scope.use_case'

import type { ActorScope } from '#features/managers/scope'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    scope: ActorScope
  }
}

/**
 * Pose le périmètre d'action sur le contexte. À utiliser après `auth()`.
 *
 * Exemple : `.use([middleware.auth(), middleware.role(['gerant']), middleware.scope()])`
 */
export default class ScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.authUser
    if (!user) {
      return ctx.response.unauthorized({
        code: 'unauthenticated',
        message: 'Authentification requise.',
      })
    }

    // La DomainError levée par le use case remonte au handler d'exceptions,
    // qui la convertit en JSON — inutile de la traduire ici.
    ctx.scope = await resolveActorScope(user, ManagerAssignment.findByManagerId)

    return next()
  }
}
