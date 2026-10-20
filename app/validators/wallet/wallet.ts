import vine from '@vinejs/vine'

import { WITHDRAWAL_STATUSES } from '#models/wallet'

const pagination = {
  page: vine.number().positive().withoutDecimals().optional(),
  per_page: vine.number().positive().withoutDecimals().max(100).optional(),
}

/**
 * GET /proprio/wallets/:id/transactions
 */
export const listWalletTransactionsValidator = vine.compile(vine.object({ ...pagination }))

/**
 * POST /proprio/wallets/:id/withdrawals
 *
 * Le minimum et le solde sont vérifiés par le use case, dans la transaction :
 * le solde ne se lit qu'au moment du débit.
 */
export const requestWithdrawalValidator = vine.compile(
  vine.object({
    amount: vine.number().positive().withoutDecimals(),
    payout_phone: vine.string().trim().minLength(8).maxLength(20),
    payout_name: vine.string().trim().maxLength(120).optional(),
  })
)

/**
 * GET /proprio/withdrawals — GET /admin/withdrawals
 */
export const listWithdrawalsValidator = vine.compile(
  vine.object({
    status: vine.enum(WITHDRAWAL_STATUSES).optional(),
    ...pagination,
  })
)

/**
 * PATCH /admin/withdrawals/:id/paid
 */
export const markWithdrawalPaidValidator = vine.compile(
  vine.object({
    payout_reference: vine.string().trim().maxLength(120).optional(),
  })
)

/**
 * PATCH /admin/withdrawals/:id/reject
 *
 * Motif obligatoire : le propriétaire voit sa demande refusée et l'argent
 * revenir, il doit savoir pourquoi.
 */
export const rejectWithdrawalValidator = vine.compile(
  vine.object({
    rejection_reason: vine.string().trim().minLength(3).maxLength(500),
  })
)
