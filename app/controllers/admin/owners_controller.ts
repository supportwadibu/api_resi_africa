/* eslint-disable prettier/prettier */
import { GetOwnerPortfolioUseCase } from '#features/properties/use_cases/index'
import {
  listOwnersValidator,
  rejectOwnerValidator,
} from '#validators/subscription/owner'

import type { HttpContext } from '@adonisjs/core/http'

import {
  FindOwnerUseCase,
  GetOwnerProfileUseCase,
  ListOwnersUseCase,
  ListPendingOwnersUseCase,
  RejectOwnerUseCase,
  ValidateOwnerUseCase,
} from '../../features/owners/use_cases/index.ts'

export default class AdminOwnersController {
  /** GET /admin/owners */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listOwnersValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListOwnersUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** GET /admin/owners/pending */
  async pending(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listOwnersValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPendingOwnersUseCase().execute({
      page: payload.page,
      per_page: payload.per_page,
    })
    return ctx.response.ok(result)
  }

  /** GET /admin/owners/:id */
  async show(ctx: HttpContext) {
    const owner = await new FindOwnerUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: owner })
  }

  /**
   * GET /admin/owners/:id/profile
   *
   * Dossier de validation, pièces d'identité en URLs signées : c'est ce que
   * l'administrateur examine avant de valider ou de rejeter le compte.
   */
  async profile(ctx: HttpContext) {
    const profile = await new GetOwnerProfileUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: profile })
  }

  /** GET /admin/owners/:id/portfolio */
  async portfolio(ctx: HttpContext) {
    const portfolio = await new GetOwnerPortfolioUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: portfolio })
  }

  /** POST /admin/owners/:id/validate */
  async validate(ctx: HttpContext) {
    const adminId = ctx.authUser?.id ?? ''
    const result = await new ValidateOwnerUseCase().execute({
      owner_id: ctx.params.id,
      admin_id: adminId,
    })
    return ctx.response.ok({
      data: result.owner,
      trial_started: result.trial_started,
      trial_end_date: result.trial_end_date,
      message: result.trial_started
        ? 'Propriétaire validé. Essai gratuit de 14 jours démarré.'
        : 'Propriétaire validé. (Son essai était déjà ouvert depuis l’inscription.)',
    })
  }

  /** POST /admin/owners/:id/reject */
  async reject(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(rejectOwnerValidator)
    const adminId = ctx.authUser?.id ?? ''
    const owner = await new RejectOwnerUseCase().execute({
      owner_id: ctx.params.id,
      admin_id: adminId,
      reason: payload.reason,
    })
    return ctx.response.ok({ data: owner, message: 'Propriétaire rejeté.' })
  }
}
