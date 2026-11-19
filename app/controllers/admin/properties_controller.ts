import { ListPropertyClientsUseCase } from '#features/clients/use_cases/index'
import {
  FindPlatformPropertyUseCase,
  ListPlatformPropertiesUseCase,
  SetPropertyVisibilityAsAdminUseCase,
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

  /** PATCH /admin/properties/:id/publish */
  async publish(ctx: HttpContext) {
    const property = await new SetPropertyVisibilityAsAdminUseCase().execute(ctx.params.id, true)
    return ctx.response.ok({ data: property, message: 'Logement publié.' })
  }

  /** PATCH /admin/properties/:id/unpublish */
  async unpublish(ctx: HttpContext) {
    const property = await new SetPropertyVisibilityAsAdminUseCase().execute(ctx.params.id, false)
    return ctx.response.ok({ data: property, message: 'Logement retiré de la vitrine.' })
  }
}
