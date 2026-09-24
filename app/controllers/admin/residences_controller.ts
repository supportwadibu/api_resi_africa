import {
  FindPlatformResidenceUseCase,
  ListPlatformResidencesUseCase,
} from '#features/residences/use_cases/index'
import { listPlatformResidencesValidator } from '#validators/residence/residence'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminResidencesController {
  /** GET /admin/residences */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPlatformResidencesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListPlatformResidencesUseCase().execute(payload)
    return ctx.response.ok(result)
  }

  /** GET /admin/residences/:id */
  async show(ctx: HttpContext) {
    const residence = await new FindPlatformResidenceUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: residence })
  }
}
