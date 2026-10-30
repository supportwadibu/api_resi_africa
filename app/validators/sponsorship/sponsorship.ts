import vine from '@vinejs/vine'

import {
  REDEMPTION_TYPES,
  REWARD_MODES,
  REDEMPTION_TYPES_BY_ROLE,
} from '#features/sponsorships/sponsorship_rules'
import { REDEMPTION_STATUSES, SPONSORSHIP_STATUSES } from '#models/sponsorship'

const pagination = {
  page: vine.number().positive().withoutDecimals().optional(),
  per_page: vine.number().positive().withoutDecimals().max(100).optional(),
}

/** Code tel que saisi : la forme canonique est rétablie par le use case. */
const code = vine.string().trim().minLength(4).maxLength(20)

/**
 * POST /sponsorship/apply
 */
export const applySponsorshipCodeValidator = vine.compile(vine.object({ code }))

/**
 * GET /sponsorship/transactions
 */
export const listSponsorshipTransactionsValidator = vine.compile(vine.object({ ...pagination }))

/**
 * POST /sponsorship/redemptions
 *
 * Seuil, solde et usages ouverts au rôle sont vérifiés par le use case, dans
 * la transaction : le solde ne se lit qu'au moment du débit.
 */
export const requestRedemptionValidator = vine.compile(
  vine.object({
    type: vine.enum(REDEMPTION_TYPES),
    amount: vine.number().positive().withoutDecimals(),
    payout_phone: vine.string().trim().minLength(8).maxLength(20).optional(),
    payout_name: vine.string().trim().maxLength(120).optional(),
  })
)

/**
 * GET /sponsorship/redemptions — GET /admin/sponsorship-redemptions
 */
export const listRedemptionsValidator = vine.compile(
  vine.object({
    status: vine.enum(REDEMPTION_STATUSES).optional(),
    type: vine.enum(REDEMPTION_TYPES).optional(),
    ...pagination,
  })
)

/**
 * GET /admin/sponsorships
 */
export const listAdminSponsorshipsValidator = vine.compile(
  vine.object({
    status: vine.enum(SPONSORSHIP_STATUSES).optional(),
    sponsor_id: vine.string().trim().optional(),
    ...pagination,
  })
)

/**
 * PATCH /admin/sponsorships/:id/cancel
 *
 * Motif obligatoire : le parrain voit son gain disparaître, l'équipe doit
 * pouvoir dire pourquoi.
 */
export const cancelSponsorshipValidator = vine.compile(
  vine.object({ reason: vine.string().trim().minLength(3).maxLength(500) })
)

/**
 * PATCH /admin/sponsorship-redemptions/:id/paid
 */
export const markRedemptionPaidValidator = vine.compile(
  vine.object({ payout_reference: vine.string().trim().maxLength(120).optional() })
)

/**
 * PATCH /admin/sponsorship-redemptions/:id/reject
 */
export const rejectRedemptionValidator = vine.compile(
  vine.object({ rejection_reason: vine.string().trim().minLength(3).maxLength(500) })
)

const rewardRule = vine.object({
  mode: vine.enum(REWARD_MODES),
  value: vine.number().min(0).max(1_000_000),
  max_amount: vine.number().withoutDecimals().min(0).max(1_000_000).nullable(),
  hold_days: vine.number().withoutDecimals().range([0, 90]),
})

const redemptionRule = (role: 'client' | 'proprio') =>
  vine.object({
    minimum_amount: vine.number().withoutDecimals().range([100, 1_000_000]),
    options: vine.array(vine.enum(REDEMPTION_TYPES_BY_ROLE[role])).distinct(),
  })

/**
 * PUT /admin/settings/sponsorships
 *
 * Le document entier : un gain réglé à moitié n'aurait pas de sens.
 */
export const updateSponsorshipSettingsValidator = vine.compile(
  vine.object({
    enabled: vine.boolean(),
    rewards: vine.object({ client: rewardRule.clone(), proprio: rewardRule.clone() }),
    redemption: vine.object({
      client: redemptionRule('client'),
      proprio: redemptionRule('proprio'),
    }),
    attach_window_days: vine.number().withoutDecimals().range([0, 365]),
  })
)
