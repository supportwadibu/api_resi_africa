import {
  GetDepositSettingsUseCase,
  UpdateDepositSettingsUseCase,
} from '#features/deposits/use_cases/deposit_settings.use_case'
import { updateDepositSettingsValidator } from '#validators/deposit/deposit'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminDepositsController {
  /** GET /admin/settings/deposits */
  async settings(ctx: HttpContext) {
    const data = await new GetDepositSettingsUseCase().execute()
    return ctx.response.ok({ data })
  }

  /** PUT /admin/settings/deposits */
  async updateSettings(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateDepositSettingsValidator)
    const data = await new UpdateDepositSettingsUseCase().execute(payload, ctx.authUser!.id)
    return ctx.response.ok({ data })
  }
}
