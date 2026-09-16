import { updateManagerProfileValidator } from '#validators/manager/manager'

import type { HttpContext } from '@adonisjs/core/http'

import GetManagerProfileUseCase from '../../features/managers/use_cases/get_manager_profile.use_case.ts'
import UpdateManagerProfileUseCase from '../../features/managers/use_cases/update_manager_profile.use_case.ts'

/**
 * Profil du gérant connecté.
 *
 * L'identifiant est pris sur `ctx.scope.actorId` — l'acteur réel — et non sur
 * `ownerId`, qui est le propriétaire pour le compte duquel il agit. Les
 * confondre ici ferait lire, et réécrire, le compte du propriétaire.
 */
export default class GerantProfileController {
  async show(ctx: HttpContext) {
    const profile = await new GetManagerProfileUseCase().execute(ctx.scope.actorId)
    return ctx.response.ok({ data: profile })
  }

  /** Nom et mot de passe. Coordonnées et périmètre relèvent du propriétaire. */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateManagerProfileValidator)

    const profile = await new UpdateManagerProfileUseCase().execute(ctx.scope.actorId, {
      full_name: payload.full_name,
      current_password: payload.current_password,
      new_password: payload.new_password,
    })

    return ctx.response.ok({ data: profile })
  }
}
