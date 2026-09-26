import {
  CancelSubscriptionUseCase,
  ExtendSubscriptionUseCase,
  ListSubscriptionsUseCase,
} from '#features/subscriptions/use_cases/index'
import {
  cancelSubscriptionValidator,
  extendSubscriptionValidator,
  listSubscriptionsValidator,
} from '#validators/subscription/subscription'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminSubscriptionsController {
  /** GET /admin/subscriptions */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listSubscriptionsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListSubscriptionsUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** PATCH /admin/subscriptions/:id/extend */
  async extend(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(extendSubscriptionValidator)
    const subscription = await new ExtendSubscriptionUseCase().execute({
      subscription_id: ctx.params.id,
      days: payload.days,
      reason: payload.reason,
      admin_id: ctx.authUser?.id ?? '',
    })
    return ctx.response.ok({ data: subscription })
  }

  /** PATCH /admin/subscriptions/:id/cancel */
  async cancel(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(cancelSubscriptionValidator)
    const subscription = await new CancelSubscriptionUseCase().execute({
      subscription_id: ctx.params.id,
      reason: payload.reason,
    })
    return ctx.response.ok({ data: subscription })
  }
}
