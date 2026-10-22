import { financeOverviewValidator } from '#validators/finance/finance'

import type { HttpContext } from '@adonisjs/core/http'

import GetFinanceOverviewUseCase from '../../features/finance/use_cases/get_finance_overview.use_case.ts'

export default class ProprioFinanceController {
  /**
   * Revenus, charges et bénéfice net du propriétaire connecté.
   *
   * `residence_id` restreint le relevé à une résidence : le revenu de ses
   * unités, ses charges communes et celles de ses unités.
   */
  async overview(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(financeOverviewValidator, {
      data: ctx.request.qs(),
    })

    const overview = await new GetFinanceOverviewUseCase().execute(userId, {
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
      residence_id: payload.residence_id,
      property_id: payload.property_id,
    })
    return ctx.response.ok({ data: overview })
  }

  /**
   * Revenus et taux d'occupation de la période, sans charges ni bénéfice :
   * le tableau de bord de RESI Basic. `residence_id` et `property_id` sont
   * ignorés — le suivi par résidence relève de RESI Pro.
   */
  async performance(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(financeOverviewValidator, {
      data: ctx.request.qs(),
    })

    const performance = await new GetFinanceOverviewUseCase().executePerformance(userId, {
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
    })
    return ctx.response.ok({ data: performance })
  }
}
