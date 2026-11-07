import {
  GetPlatformStatsUseCase,
  GetRevenueSeriesUseCase,
  GetStayTypeBreakdownUseCase,
  GetSubscriptionRevenueUseCase,
} from '#features/platform_stats/use_cases/index'
import {
  revenueSeriesValidator,
  stayTypeBreakdownValidator,
  subscriptionRevenueValidator,
} from '#validators/stats/stats'

import type { HttpContext } from '@adonisjs/core/http'
import type { DateTime } from 'luxon'

/**
 * Jour saisi, à minuit UTC — l'heure d'Abidjan. VineJS le lit dans le fuseau
 * du serveur : repartir de la date seule évite qu'un serveur réglé ailleurs
 * décale la période d'un jour.
 */
function utcDay(day?: DateTime): Date | undefined {
  const iso = day?.toISODate()
  return iso ? new Date(`${iso}T00:00:00Z`) : undefined
}

export default class AdminStatsController {
  /** GET /admin/stats */
  async overview(ctx: HttpContext) {
    const stats = await new GetPlatformStatsUseCase().execute()
    return ctx.response.ok({ data: stats })
  }

  /** GET /admin/stats/subscriptions — revenu de RESI : les abonnements. */
  async subscriptions(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(subscriptionRevenueValidator, {
      data: ctx.request.qs(),
    })
    const revenue = await new GetSubscriptionRevenueUseCase().execute(payload)
    return ctx.response.ok({ data: revenue })
  }

  /** GET /admin/stats/revenue */
  async revenue(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(revenueSeriesValidator, {
      data: ctx.request.qs(),
    })
    const series = await new GetRevenueSeriesUseCase().execute(payload)
    return ctx.response.ok({ data: series })
  }

  /** GET /admin/stats/stay-types — réservations par type et durée de séjour. */
  async stayTypes(ctx: HttpContext) {
    const { from, to, ...payload } = await ctx.request.validateUsing(stayTypeBreakdownValidator, {
      data: ctx.request.qs(),
    })
    const breakdown = await new GetStayTypeBreakdownUseCase().execute({
      ...payload,
      from: utcDay(from),
      to: utcDay(to),
    })
    return ctx.response.ok({ data: breakdown })
  }
}
