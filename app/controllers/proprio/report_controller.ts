import { generateReportValidator } from '#validators/report/report'

import type { HttpContext } from '@adonisjs/core/http'

import GenerateReportUseCase from '../../features/reports/use_cases/generate_report.use_case.ts'

export default class ProprioReportController {
  /**
   * Édite un rapport PDF et renvoie une URL signée à durée limitée.
   */
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(generateReportValidator)

    const report = await new GenerateReportUseCase().execute(userId, payload)

    return ctx.response.ok({ data: report })
  }
}
