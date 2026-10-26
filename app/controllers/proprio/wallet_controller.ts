import {
  listWalletTransactionsValidator,
  listWithdrawalsValidator,
  requestWithdrawalValidator,
  savePayoutNumbersValidator,
} from '#validators/wallet/wallet'

import type { HttpContext } from '@adonisjs/core/http'

import {
  GetPayoutSettingsUseCase,
  SavePayoutNumbersUseCase,
  ListOwnerWalletsUseCase,
  ListWalletTransactionsUseCase,
  ListWithdrawalsUseCase,
  RequestWithdrawalUseCase,
} from '../../features/wallets/use_cases/index.ts'

/** Portefeuilles des résidences et demandes de retrait du propriétaire. */
export default class ProprioWalletController {
  /** GET /proprio/wallets */
  async index(ctx: HttpContext) {
    const data = await new ListOwnerWalletsUseCase().execute(ctx.authUser!.id)
    return ctx.response.ok({ data })
  }

  /** GET /proprio/wallets/:id/transactions */
  async transactions(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listWalletTransactionsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListWalletTransactionsUseCase().execute(
      ctx.params.id,
      ctx.authUser!.id,
      payload
    )
    return ctx.response.ok(result)
  }

  /** POST /proprio/wallets/:id/withdrawals */
  async requestWithdrawal(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(requestWithdrawalValidator)
    const data = await new RequestWithdrawalUseCase().execute({
      ...payload,
      owner_id: ctx.authUser!.id,
      wallet_id: ctx.params.id,
    })
    return ctx.response.created({ data })
  }

  /** GET /proprio/payout-settings */
  async payoutSettings(ctx: HttpContext) {
    const data = await new GetPayoutSettingsUseCase().execute(ctx.authUser!.id)
    return ctx.response.ok({ data })
  }

  /** PUT /proprio/payout-numbers */
  async savePayoutNumbers(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(savePayoutNumbersValidator)
    const data = await new SavePayoutNumbersUseCase().execute(ctx.authUser!.id, payload.numbers)
    return ctx.response.ok({ data })
  }

  /** GET /proprio/withdrawals */
  async withdrawals(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listWithdrawalsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListWithdrawalsUseCase().execute({
      ...payload,
      owner_id: ctx.authUser!.id,
    })
    return ctx.response.ok(result)
  }
}
