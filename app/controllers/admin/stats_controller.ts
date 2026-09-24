import {
  GetPlatformStatsUseCase,
  GetRevenueSeriesUseCase,
} from '#features/platform_stats/use_cases/index'
import { revenueSeriesValidator } from '#validators/stats/stats'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminStatsController {
  /** GET /admin/stats */
  async overview(ctx: HttpContext) {
    const stats = await new GetPlatformStatsUseCase().execute()
    return ctx.response.ok({ data: stats })
  }

  /** GET /admin/stats/revenue */
  async revenue(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(revenueSeriesValidator, {
      data: ctx.request.qs(),
    })
    const series = await new GetRevenueSeriesUseCase().execute(payload)
    return ctx.response.ok({ data: series })
  }
}
