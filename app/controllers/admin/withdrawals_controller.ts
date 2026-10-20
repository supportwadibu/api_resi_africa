import {
  listWithdrawalsValidator,
  markWithdrawalPaidValidator,
  rejectWithdrawalValidator,
} from '#validators/wallet/wallet'

import type { HttpContext } from '@adonisjs/core/http'

import {
  GetAdminWithdrawalUseCase,
  ListAdminWithdrawalsUseCase,
  ResolveWithdrawalUseCase,
} from '../../features/wallets/use_cases/index.ts'

/**
 * Demandes de retrait des propriétaires, traitées par l'équipe : le transfert
 * Wave se fait hors de l'API, puis la demande est marquée versée — ou refusée,
 * et le montant revient au portefeuille.
 */
export default class AdminWithdrawalsController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listWithdrawalsValidator, {
      data: ctx.request.qs(),
    })
    return ctx.response.ok(await new ListAdminWithdrawalsUseCase().execute(payload))
  }

  async show(ctx: HttpContext) {
    const data = await new GetAdminWithdrawalUseCase().execute(ctx.params.id)
    return ctx.response.ok({ data })
  }

  async markPaid(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(markWithdrawalPaidValidator)
    const data = await new ResolveWithdrawalUseCase().execute(ctx.params.id, ctx.authUser!.id, {
      status: 'paid',
      payout_reference: payload.payout_reference ?? null,
    })
    return ctx.response.ok({ data })
  }

  async reject(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(rejectWithdrawalValidator)
    const data = await new ResolveWithdrawalUseCase().execute(ctx.params.id, ctx.authUser!.id, {
      status: 'rejected',
      rejection_reason: payload.rejection_reason,
    })
    return ctx.response.ok({ data })
  }
}
