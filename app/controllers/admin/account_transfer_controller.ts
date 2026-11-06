import { readFile } from 'node:fs/promises'

import {
  ExportAccountUseCase,
  PreviewAccountExportUseCase,
} from '#features/users/use_cases/account_export.use_case'
import ImportAccountUseCase from '#features/users/use_cases/import_account.use_case'
import { exportAccountValidator, importAccountValidator } from '#validators/user/account_transfer'

import type { HttpContext } from '@adonisjs/core/http'

/**
 * Export et réimport d'un compte avec ses données, au choix de
 * l'administrateur. Voir `app/features/users/account_transfer.ts`.
 */
export default class AdminAccountTransferController {
  /** GET /admin/users/:id/export/preview — volumes de chaque section. */
  async preview(ctx: HttpContext) {
    const preview = await new PreviewAccountExportUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: preview })
  }

  /** GET /admin/users/:id/export?sections=… */
  async export(ctx: HttpContext) {
    const { sections } = await ctx.request.validateUsing(exportAccountValidator, {
      data: ctx.request.qs(),
    })
    const file = await new ExportAccountUseCase().execute(ctx.params.id, sections ?? [])
    return ctx.response.ok({ data: file })
  }

  /** POST /admin/users/import — multipart, champ `file`. */
  async import(ctx: HttpContext) {
    const { file } = await ctx.request.validateUsing(importAccountValidator)
    const content = await readFile(file.tmpPath!, 'utf8')

    const report = await new ImportAccountUseCase().execute(content)
    return ctx.response.ok({ data: report })
  }
}
