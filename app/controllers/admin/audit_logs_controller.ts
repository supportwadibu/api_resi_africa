import { GetAuditLogUseCase, ListAuditLogsUseCase } from '#features/audit_logs/use_cases/index'
import { listAuditLogsValidator } from '#validators/audit_log/audit_log'

import type { HttpContext } from '@adonisjs/core/http'

export default class AdminAuditLogsController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listAuditLogsValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListAuditLogsUseCase().execute({
      ...payload,
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
    })
    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const log = await new GetAuditLogUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data: log })
  }
}
