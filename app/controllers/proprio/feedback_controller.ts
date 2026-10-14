import { createFeedbackValidator, listFeedbacksValidator } from '#validators/feedback/feedback'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateFeedbackUseCase,
  ListMyFeedbacksUseCase,
} from '../../features/feedbacks/use_cases/index.ts'

export default class ProprioFeedbackController {
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createFeedbackValidator)

    const feedback = await new CreateFeedbackUseCase().execute({ ...payload, user_id: userId })
    return ctx.response.created({ data: feedback })
  }

  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listFeedbacksValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListMyFeedbacksUseCase().execute({ ...payload, user_id: userId })
    return ctx.response.ok(result)
  }
}
