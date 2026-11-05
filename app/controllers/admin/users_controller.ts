import {
  CreateUserUseCase,
  DeleteUserUseCase,
  GetUserUseCase,
  ListUsersUseCase,
  PreviewUserPurgeUseCase,
  PurgeUserUseCase,
  RestoreUserUseCase,
  UpdateUserUseCase,
} from '#features/users/use_cases/index'
import { createUserValidator, listUsersValidator, updateUserValidator } from '#validators/user/user'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminUsersController {
  /** GET /admin/users */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listUsersValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListUsersUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** POST /admin/users */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createUserValidator)
    const user = await new CreateUserUseCase().execute({
      ...payload,
      admin_id: ctx.authUser?.id ?? '',
    })
    return ctx.response.created({ data: user })
  }

  /** GET /admin/users/:id */
  async show(ctx: HttpContext) {
    const user = await new GetUserUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: user })
  }

  /** PATCH /admin/users/:id */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateUserValidator)
    const result = await new UpdateUserUseCase().execute({
      user_id: ctx.params.id,
      admin_id: ctx.authUser?.id ?? '',
      patch: payload,
    })
    return ctx.response.ok({ data: result.user, revoked_sessions: result.revoked_sessions })
  }

  /** DELETE /admin/users/:id — suppression douce, restaurable. */
  async destroy(ctx: HttpContext) {
    const result = await new DeleteUserUseCase().execute({
      user_id: ctx.params.id,
      admin_id: ctx.authUser?.id ?? '',
    })
    return ctx.response.ok({ data: result.user, revoked_sessions: result.revoked_sessions })
  }

  /** POST /admin/users/:id/restore */
  async restore(ctx: HttpContext) {
    const user = await new RestoreUserUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: user })
  }

  /** GET /admin/users/:id/purge — aperçu de la suppression définitive. */
  async purgePreview(ctx: HttpContext) {
    const preview = await new PreviewUserPurgeUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: preview })
  }

  /** DELETE /admin/users/:id/purge — suppression définitive, en cascade. */
  async purge(ctx: HttpContext) {
    const report = await new PurgeUserUseCase().execute({
      user_id: ctx.params.id,
      admin_id: ctx.authUser?.id ?? '',
    })
    return ctx.response.ok({ data: report })
  }
}
