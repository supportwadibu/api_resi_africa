import {
  PreviewAccountDeletionUseCase,
  RequestAccountDeletionUseCase,
} from '#features/users/use_cases/index'
import { deleteAccountValidator } from '#validators/auth/auth'

import type { HttpContext } from '@adonisjs/core/http'

/** Compte de l'utilisateur connecté, tous rôles sauf `admin`. */
export default class AccountController {
  /** GET /auth/account/deletion — ce qui bloque la suppression, ce qu'elle emporte. */
  async deletionPreview(ctx: HttpContext) {
    const user = ctx.authUser
    if (!user) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const preview = await new PreviewAccountDeletionUseCase().execute(user.id)
    return ctx.response.ok({ data: preview })
  }

  /** DELETE /auth/account — ferme le compte et programme son effacement. */
  async destroy(ctx: HttpContext) {
    const user = ctx.authUser
    if (!user) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(deleteAccountValidator)
    const result = await new RequestAccountDeletionUseCase().execute({
      user_id: user.id,
      reason: payload.reason ?? null,
    })
    return ctx.response.ok({ data: result })
  }
}
