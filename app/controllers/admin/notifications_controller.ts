import {
  listNotificationCampaignsValidator,
  sendAdminNotificationValidator,
} from '#validators/notification/notification'

import type { HttpContext } from '@adonisjs/core/http'

import {
  ListNotificationCampaignsUseCase,
  SendAdminNotificationUseCase,
} from '../../features/notifications/use_cases/index.ts'

export default class AdminNotificationsController {
  /** GET /admin/notifications — historique des envois. */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listNotificationCampaignsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok(await new ListNotificationCampaignsUseCase().execute(payload))
  }

  /** POST /admin/notifications — envoi groupé ou ciblé aux propriétaires. */
  async store(ctx: HttpContext) {
    const adminId = ctx.authUser?.id
    if (!adminId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(sendAdminNotificationValidator)
    const campaign = await new SendAdminNotificationUseCase().execute({
      ...payload,
      created_by: adminId,
    })

    return ctx.response.created({ data: campaign })
  }
}
