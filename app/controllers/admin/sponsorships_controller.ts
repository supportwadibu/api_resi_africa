import {
  cancelSponsorshipValidator,
  listAdminSponsorshipsValidator,
  listRedemptionsValidator,
  markRedemptionPaidValidator,
  rejectRedemptionValidator,
  updateSponsorshipSettingsValidator,
} from '#validators/sponsorship/sponsorship'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CancelSponsorshipRewardUseCase,
  GetSponsorshipSettingsUseCase,
  ListAdminSponsorshipsUseCase,
  ListRedemptionsUseCase,
  ResolveRedemptionUseCase,
  UpdateSponsorshipSettingsUseCase,
} from '../../features/sponsorships/use_cases/index.ts'

/**
 * Parrainage côté équipe : suivi des filleuls et des gains, retraits de gains
 * à verser à la main sur Wave, réglages du programme.
 */
export default class AdminSponsorshipsController {
  /** GET /admin/sponsorships */
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listAdminSponsorshipsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok(await new ListAdminSponsorshipsUseCase().execute(payload))
  }

  /** PATCH /admin/sponsorships/:id/cancel */
  async cancel(ctx: HttpContext) {
    const { reason } = await ctx.request.validateUsing(cancelSponsorshipValidator)
    const data = await new CancelSponsorshipRewardUseCase().execute(
      ctx.params.id,
      ctx.authUser!.id,
      reason
    )
    return ctx.response.ok({ data })
  }

  /** GET /admin/sponsorship-redemptions */
  async redemptions(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listRedemptionsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok(await new ListRedemptionsUseCase().forAdmin(payload))
  }

  /** PATCH /admin/sponsorship-redemptions/:id/paid */
  async markPaid(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(markRedemptionPaidValidator)
    const data = await new ResolveRedemptionUseCase().execute(ctx.params.id, ctx.authUser!.id, {
      status: 'paid',
      payout_reference: payload.payout_reference ?? null,
    })
    return ctx.response.ok({ data })
  }

  /** PATCH /admin/sponsorship-redemptions/:id/reject */
  async reject(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(rejectRedemptionValidator)
    const data = await new ResolveRedemptionUseCase().execute(ctx.params.id, ctx.authUser!.id, {
      status: 'rejected',
      rejection_reason: payload.rejection_reason,
    })
    return ctx.response.ok({ data })
  }

  /** GET /admin/settings/sponsorships */
  async settings(ctx: HttpContext) {
    const data = await new GetSponsorshipSettingsUseCase().execute()
    return ctx.response.ok({ data })
  }

  /** PUT /admin/settings/sponsorships */
  async updateSettings(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updateSponsorshipSettingsValidator)
    const data = await new UpdateSponsorshipSettingsUseCase().execute(payload, ctx.authUser!.id)
    return ctx.response.ok({ data })
  }
}
