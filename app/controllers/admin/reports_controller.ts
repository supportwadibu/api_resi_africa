import GenerateReportUseCase from '#features/reports/use_cases/generate_report.use_case'
import { generatePoliceReportValidator } from '#validators/report/report'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminReportsController {
  /**
   * POST /admin/owners/:id/reports/police
   *
   * Registre des personnes hébergées d'un propriétaire, édité par
   * l'administration — le même document que celui du propriétaire, par le
   * même use case : deux chemins de composition finiraient par imprimer deux
   * registres différents pour la même période.
   *
   * Un propriétaire inconnu, ou une résidence qui n'est pas la sienne, lève
   * `owner_not_found` / `residence_not_found` (404) depuis le use case.
   */
  async police(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(generatePoliceReportValidator)

    const report = await new GenerateReportUseCase().execute(ctx.params.id, {
      ...payload,
      type: 'police',
    })

    // Même en-têtes que `ProprioReportController.store` : `filename` n'est
    // composé que de valeurs maîtrisées par le serveur.
    ctx.response.header('Content-Type', 'application/pdf')
    ctx.response.header('Content-Disposition', `attachment; filename="${report.filename}"`)
    ctx.response.header('Content-Length', String(report.pdf.length))

    return ctx.response.send(report.pdf)
  }
}
