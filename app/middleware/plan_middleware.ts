import ResolvePlanAccessUseCase from '#features/subscriptions/use_cases/resolve_plan_access.use_case'
import { DomainError } from '#utils/domain_error'

import type { PlanTier } from '#features/plans/plan_tier'
import type { PlanAccess } from '#features/subscriptions/plan_access'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Accès résolu par `plan()`, gardé pour les groupes imbriqués. */
    planAccess?: PlanAccess
  }
}

/**
 * Exige un abonnement actif, et au besoin le palier complet.
 *
 * - `middleware.plan()` : un abonnement actif, quel que soit le palier.
 * - `middleware.plan({ tier: 'full' })` : le forfait 5 000 F.
 *
 * À placer après `auth()` et `role()`, et après `scope()` pour un gérant :
 * l'abonnement qui compte est celui du propriétaire pour qui il agit.
 */
export default class PlanMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: { tier?: PlanTier } = {}) {
    const ownerId = ctx.scope?.ownerId ?? ctx.authUser?.id
    if (!ownerId) {
      return ctx.response.unauthorized({
        code: 'unauthenticated',
        message: 'Authentification requise.',
      })
    }

    // Un groupe `full` imbriqué dans un groupe `plan()` rejouerait la même
    // lecture : l'accès est résolu une fois par requête.
    if (ctx.planAccess === undefined) {
      ctx.planAccess = await new ResolvePlanAccessUseCase().execute(ownerId)
    }

    if (ctx.planAccess === null) {
      throw new DomainError(
        'subscription_required',
        'Votre abonnement est inactif. Souscrivez un forfait pour continuer.',
        403
      )
    }

    if (options.tier === 'full' && ctx.planAccess !== 'full') {
      throw new DomainError(
        'plan_upgrade_required',
        'Cette fonction est réservée au forfait 5 000 F.',
        403
      )
    }

    return next()
  }
}
