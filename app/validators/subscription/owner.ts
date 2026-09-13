import { OWNER_VALIDATION_STATUSES } from '#utils/enums/owner_validation_status'

import vine from '@vinejs/vine'

export const listOwnersValidator = vine.compile(
  vine.object({
    status: vine.enum(OWNER_VALIDATION_STATUSES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

export const rejectOwnerValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(3).maxLength(500),
  })
)
