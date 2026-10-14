import {
  FindPlatformBookingUseCase,
  ListPlatformBookingsUseCase,
} from '#features/bookings/use_cases/index'
import { listPlatformBookingsValidator } from '#validators/booking/booking'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminBookingsController {
  /** GET /admin/bookings */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPlatformBookingsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPlatformBookingsUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** GET /admin/bookings/:id */
  async show(ctx: HttpContext) {
    const booking = await new FindPlatformBookingUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: booking })
  }
}
