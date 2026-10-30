import {
  applySponsorshipCodeValidator,
  listRedemptionsValidator,
  listSponsorshipTransactionsValidator,
  requestRedemptionValidator,
} from '#validators/sponsorship/sponsorship'

import type { HttpContext } from '@adonisjs/core/http'

import {
  AttachSponsorUseCase,
  CheckSponsorshipCodeUseCase,
  GetSponsorshipOverviewUseCase,
  ListRedemptionsUseCase,
  ListSponsoredUsersUseCase,
  ListSponsorshipTransactionsUseCase,
  RequestRedemptionUseCase,
} from '../features/sponsorships/use_cases/index.ts'

/**
 * Parrainage, côté parrain : client comme propriétaire, sous un même
 * préfixe — le programme est le même, seuls les usages des gains diffèrent.
 */
export default class SponsorshipController {
  /** GET /sponsorship/codes/:code — public, avant l'inscription. */
  async checkCode(ctx: HttpContext) {
    const data = await new CheckSponsorshipCodeUseCase().execute(ctx.params.code)
    return ctx.response.ok({ data })
  }

  /** GET /sponsorship */
  async show(ctx: HttpContext) {
    const data = await new GetSponsorshipOverviewUseCase().execute(ctx.authUser!.id)
    return ctx.response.ok({ data })
  }

  /** POST /sponsorship/apply */
  async apply(ctx: HttpContext) {
    const { code } = await ctx.request.validateUsing(applySponsorshipCodeValidator)
    const data = await new AttachSponsorUseCase().execute({
      user_id: ctx.authUser!.id,
      code,
      mode: 'later',
    })
    return ctx.response.created({ data })
  }

  /** GET /sponsorship/sponsored */
  async sponsored(ctx: HttpContext) {
    const data = await new ListSponsoredUsersUseCase().execute(ctx.authUser!.id)
    return ctx.response.ok({ data })
  }

  /** GET /sponsorship/transactions */
  async transactions(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listSponsorshipTransactionsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListSponsorshipTransactionsUseCase().execute(ctx.authUser!.id, payload)
    return ctx.response.ok(result)
  }

  /** GET /sponsorship/redemptions */
  async redemptions(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listRedemptionsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListRedemptionsUseCase().forUser(ctx.authUser!.id, payload)
    return ctx.response.ok(result)
  }

  /** POST /sponsorship/redemptions */
  async requestRedemption(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(requestRedemptionValidator)
    const data = await new RequestRedemptionUseCase().execute({
      ...payload,
      user_id: ctx.authUser!.id,
    })
    return ctx.response.created({ data })
  }
}
