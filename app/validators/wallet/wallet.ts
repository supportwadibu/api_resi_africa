import vine from '@vinejs/vine'

import { MAX_PAYOUT_NUMBERS } from '#features/wallets/wallet_rules'
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
    /** Numéro enregistré à créditer. Prime sur `payout_phone`. */
    payout_slot: vine
      .number()
      .withoutDecimals()
      .range([1, MAX_PAYOUT_NUMBERS])
      .optional()
      .requiredIfMissing('payout_phone'),
    // Optionnels : les applications antérieures aux numéros enregistrés
    // saisissent encore le numéro à la main.
    payout_phone: vine.string().trim().minLength(8).maxLength(20).optional(),
    payout_name: vine.string().trim().maxLength(120).optional(),
  })
)

/**
 * PUT /proprio/payout-numbers
 *
 * La forme seule : positions, doublons et format sont vérifiés par
 * `normalizePayoutNumbers`, qui dit pourquoi un numéro est refusé.
 */
export const savePayoutNumbersValidator = vine.compile(
  vine.object({
    numbers: vine
      .array(
        vine.object({
          slot: vine.number().withoutDecimals(),
          phone: vine.string().trim().minLength(1).maxLength(30),
          holder_name: vine.string().trim().maxLength(120).optional(),
        })
      )
      .maxLength(MAX_PAYOUT_NUMBERS),
  })
)

/**
 * PUT /admin/settings/withdrawals
 */
export const updateWithdrawalSettingsValidator = vine.compile(
  vine.object({
    minimum_amount: vine.number().withoutDecimals().range([100, 1_000_000]),
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
