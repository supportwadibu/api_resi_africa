import { listPublicPropertiesValidator } from '#validators/property/property'

import type { HttpContext } from '@adonisjs/core/http'

import { GetPublicAvailabilityUseCase } from '../../features/bookings/use_cases/index.ts'
import {
  FindPublicPropertyUseCase,
  ListPublicPropertiesUseCase,
} from '../../features/properties/use_cases/index.ts'

export default class ClientPropertyController {
  async availability(ctx: HttpContext) {
    const periods = await new GetPublicAvailabilityUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: periods })
  }

  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPublicPropertiesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPublicPropertiesUseCase().execute({
      ...payload,
      available_from: payload.available_from?.toJSDate(),
    })
    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const property = await new FindPublicPropertyUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: property })
  }

  async search(ctx: HttpContext) {
    return this.index(ctx)
  }

  async featured(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPublicPropertiesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPublicPropertiesUseCase().execute({
      ...payload,
      featured: true,
      available_from: payload.available_from?.toJSDate(),
    })
    return ctx.response.ok(result)
  }
}
