import {
  createPlanValidator,
  listPlansValidator,
  updatePlanValidator,
} from '#validators/subscription/plan'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreatePlanUseCase,
  DeletePlanUseCase,
  FindPlanUseCase,
  ListPlansUseCase,
  UpdatePlanUseCase,
} from '../../features/plans/use_cases/index.ts'

export default class AdminPlansController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPlansValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPlansUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const plan = await new FindPlanUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: plan })
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createPlanValidator)
    const plan = await new CreatePlanUseCase().execute(payload)
    return ctx.response.created({ data: plan })
  }

  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updatePlanValidator)
    const plan = await new UpdatePlanUseCase().execute(ctx.params.id, payload)
    return ctx.response.ok({ data: plan })
  }

  async destroy(ctx: HttpContext) {
    await new DeletePlanUseCase().execute(ctx.params.id)
    return ctx.response.noContent()
  }
}
