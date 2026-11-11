import {
  GetCommissionSettingsUseCase,
  UpdateCommissionSettingsUseCase,
} from '#features/commissions/use_cases/commission_settings.use_case'
import { updateCommissionSettingsValidator } from '#validators/commission/commission'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminCommissionsController {
  /** GET /admin/settings/commissions */
  async settings(ctx: HttpContext) {
    const data = await new GetCommissionSettingsUseCase().execute()
    return ctx.response.ok({ data })
  }

  /** PUT /admin/settings/commissions */
  async updateSettings(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateCommissionSettingsValidator)
    const data = await new UpdateCommissionSettingsUseCase().execute(payload, ctx.authUser!.id)
    return ctx.response.ok({ data })
  }
}
