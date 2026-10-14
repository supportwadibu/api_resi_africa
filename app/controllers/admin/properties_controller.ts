import { ListPropertyClientsUseCase } from '#features/clients/use_cases/index'
import {
  FindPlatformPropertyUseCase,
  ListPlatformPropertiesUseCase,
} from '#features/properties/use_cases/index'
import { listPlatformPropertiesValidator } from '#validators/property/property'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminPropertiesController {
  /** GET /admin/properties */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPlatformPropertiesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPlatformPropertiesUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** GET /admin/properties/:id */
  async show(ctx: HttpContext) {
    const property = await new FindPlatformPropertyUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: property })
  }

  /** GET /admin/properties/:id/clients */
  async clients(ctx: HttpContext) {
    const result = await new ListPropertyClientsUseCase().execute(ctx.params.id)
    return ctx.response.ok(result)
  }
}
