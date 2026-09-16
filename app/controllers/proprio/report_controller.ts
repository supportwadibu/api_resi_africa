import GenerateReportUseCase from '#features/reports/use_cases/generate_report.use_case'
import { generateReportValidator } from '#validators/report/report'

import type { HttpContext } from '@adonisjs/core/http'

export default class ProprioReportController {
  /**
   * Édite un rapport PDF et le renvoie directement dans la réponse.
   *
   * Le PDF n'est plus déposé sur Cloudinary : en mode `authenticated`, seule
   * offre compatible avec des documents privés, l'URL signée renvoyait 401 en
   * production — la « token-based authentication » n'existe pas sur l'offre
   * gratuite. Le document porte en plus le chiffre d'affaires du propriétaire
   * et les coordonnées de ses clients : ne plus le faire transiter par un
   * tiers est un bénéfice, pas seulement un contournement.
   */
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(generateReportValidator)

    const report = await new GenerateReportUseCase().execute(userId, payload)

    // `filename` est assaini par `buildFilename` (minuscules, `[a-z0-9-]`
    // uniquement) à partir de valeurs entièrement maîtrisées par le serveur —
    // aucune saisie utilisateur n'y entre. Un en-tête HTTP construit depuis
    // une chaîne non filtrée admettrait une injection de CRLF ; ici l'alphabet
    // restreint l'exclut par construction.
    ctx.response.header('Content-Type', 'application/pdf')
    ctx.response.header('Content-Disposition', `attachment; filename="${report.filename}"`)
    ctx.response.header('Content-Length', String(report.pdf.length))

    return ctx.response.send(report.pdf)
  }
}
