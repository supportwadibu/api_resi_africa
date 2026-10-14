import {
  cancelBookingValidator,
  createBookingValidator,
  listBookingsValidator,
  updateBookingValidator,
} from '#validators/booking/booking'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CancelBookingUseCase,
  CreateBookingUseCase,
  ListMyBookingsUseCase,
} from '../../features/bookings/use_cases/index.ts'
import UpdateBookingUseCase from '../../features/bookings/use_cases/update_booking.use_case.ts'

export default class ClientBookingController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listBookingsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListMyBookingsUseCase().execute(userId, payload)
    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createBookingValidator)
    const booking = await new CreateBookingUseCase().execute({
      property_id: ctx.params.property_id,
      client_id: userId,
      start_date: payload.start_date.toJSDate(),
      end_date: payload.end_date.toJSDate(),
      promo_code: payload.promo_code,
      message: payload.message,
    })
    return ctx.response.created({ data: booking })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateBookingValidator)
    const booking = await new UpdateBookingUseCase().execute(ctx.params.id, userId, {
      end_date: payload.end_date.toJSDate(),
      promo_code: payload.promo_code,
      message: payload.message,
    })

    return ctx.response.ok({ data: booking })
  }

  async cancel(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(cancelBookingValidator)
    const booking = await new CancelBookingUseCase().execute(ctx.params.id, userId, payload)
    return ctx.response.ok({ data: booking })
  }
}
