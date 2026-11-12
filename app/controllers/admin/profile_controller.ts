import { GetUserUseCase, UpdateAdminProfileUseCase } from '#features/users/use_cases/index'
import { updateAdminProfileValidator } from '#validators/user/user'

import type { HttpContext } from '@adonisjs/core/http'

/** Compte de l'administrateur connecté (« Mon compte » du back-office). */
export default class AdminProfileController {
  /** GET /admin/profile */
  async show(ctx: HttpContext) {
    const user = await new GetUserUseCase().execute(ctx.authUser.id)
    return ctx.response.ok({ data: user })
  }

  /** PATCH /admin/profile */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateAdminProfileValidator)
    const result = await new UpdateAdminProfileUseCase().execute({
      admin_id: ctx.authUser.id,
      current_jti: ctx.authPayload.jti,
      patch: payload,
    })
    return ctx.response.ok({ data: result.user, revoked_sessions: result.revoked_sessions })
  }
}
