import { readFile } from 'node:fs/promises'

import { ExportClientsUseCase, ImportClientsUseCase } from '#features/clients/use_cases/index'
import { importClientsValidator } from '#validators/client/client_transfer'

import type { HttpContext } from '@adonisjs/core/http'

/**
 * Export et réimport du carnet clients de toute la plateforme, pour vider la
 * base sans perdre les fiches. Voir `app/features/clients/client_transfer.ts`.
 */
export default class AdminClientsController {
  /** GET /admin/clients/export */
  async export(ctx: HttpContext) {
    const data = await new ExportClientsUseCase().execute()
    return ctx.response.ok({ data })
  }

  /**
   * POST /admin/clients/import — multipart, champ `file`.
   *
   * Un fichier plutôt qu'un corps JSON : l'export dépasse vite le plafond du
   * parseur JSON, que relever pour toutes les routes ouvrirait chacune à des
   * corps démesurés.
   */
  async import(ctx: HttpContext) {
    const { file } = await ctx.request.validateUsing(importClientsValidator)
    const content = await readFile(file.tmpPath!, 'utf8')

    const report = await new ImportClientsUseCase().execute(content)
    return ctx.response.ok({ data: report })
  }
}
