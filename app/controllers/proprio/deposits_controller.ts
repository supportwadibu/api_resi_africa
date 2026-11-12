import { GetDepositSettingsUseCase } from '#features/deposits/use_cases/deposit_settings.use_case'

import type { HttpContext } from '@adonisjs/core/http'

export default class ProprioDepositsController {
  /**
   * GET /proprio/settings/deposit
   *
   * Dit à l'application si l'acompte est proposé et si le propriétaire peut le
   * régler lui-même ; la règle de RESI sert de valeur par défaut au formulaire.
   */
  async show(ctx: HttpContext) {
    const settings = await new GetDepositSettingsUseCase().execute()
    return ctx.response.ok({
      data: {
        enabled: settings.enabled,
        owner_can_set: settings.owner_can_set,
        type: settings.type,
        value: settings.value,
      },
    })
  }
}
