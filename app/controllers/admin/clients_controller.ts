import { readFile } from 'node:fs/promises'

import {
  ExportClientsUseCase,
  ImportClientsUseCase,
  ListPlatformClientsUseCase,
} from '#features/clients/use_cases/index'
import {
  importClientsValidator,
  listPlatformClientsValidator,
} from '#validators/client/client_transfer'

import type { HttpContext } from '@adonisjs/core/http'

/**
 * Clients de la plateforme : liste, et export / réimport des carnets pour
 * vider la base sans perdre les fiches (voir
 * `app/features/clients/client_transfer.ts`).
 */
export default class AdminClientsController {
  /**
   * GET /admin/clients — fiches des carnets et comptes clients, avec leurs
   * propriétaires et les logements où ils ont séjourné.
   */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listPlatformClientsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok(await new ListPlatformClientsUseCase().execute(payload))
  }

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
