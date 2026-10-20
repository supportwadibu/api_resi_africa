import ResolvePlanAccessUseCase from '#features/subscriptions/use_cases/resolve_plan_access.use_case'
import { planTierLabel, tierAllows, type PlanTier } from '#features/plans/plan_tier'
import { DomainError } from '#utils/domain_error'

import type { PlanAccess } from '#features/subscriptions/plan_access'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Accès résolu par `plan()`, gardé pour les groupes imbriqués. */
    planAccess?: PlanAccess
  }
}

const PRICES: Record<PlanTier, string> = {
  free: 'gratuit',
  pro: '3 000 F / mois',
  pro_plus: '5 000 F / mois',
}

/**
 * Exige un compte actif, et au besoin un palier minimal.
 *
 * - `middleware.plan()` : un compte actif, RESI Basic gratuit compris.
 * - `middleware.plan({ tier: 'pro' })` : RESI Pro ou Pro+.
 * - `middleware.plan({ tier: 'pro_plus' })` : RESI Pro+.
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

    // Un groupe à palier imbriqué dans un groupe `plan()` rejouerait la même
    // lecture : l'accès est résolu une fois par requête.
    if (ctx.planAccess === undefined) {
      ctx.planAccess = await new ResolvePlanAccessUseCase().execute(ownerId)
    }

    // Plus d'abonnement échu ici : il retombe sur le palier gratuit. `null`
    // ne désigne qu'un compte rejeté ou suspendu.
    if (ctx.planAccess === null) {
      throw new DomainError(
        'subscription_required',
        'Votre compte est inactif. Contactez l’équipe RESI pour le réactiver.',
        403
      )
    }

    if (options.tier && !tierAllows(ctx.planAccess, options.tier)) {
      throw new DomainError(
        'plan_upgrade_required',
        `Cette fonction est réservée au forfait ${planTierLabel(options.tier)} (${PRICES[options.tier]}).`,
        403
      )
    }

    return next()
  }
}
