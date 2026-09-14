import {
  listFeedbacksValidator,
  updateFeedbackStatusValidator,
} from '#validators/feedback/feedback'

import type { HttpContext } from '@adonisjs/core/http'

import {
  GetFeedbackUseCase,
  ListFeedbacksUseCase,
  UpdateFeedbackStatusUseCase,
} from '../../features/feedbacks/use_cases/index.ts'

export default class AdminFeedbackController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listFeedbacksValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListFeedbacksUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const feedback = await new GetFeedbackUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: feedback })
  }

  async updateStatus(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateFeedbackStatusValidator)
    const feedback = await new UpdateFeedbackStatusUseCase().execute(ctx.params.id, payload)
    return ctx.response.ok({ data: feedback })
  }
}
