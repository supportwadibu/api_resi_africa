import { AUDIT_METHODS, AUDIT_OUTCOMES } from '#models/audit_log'
import { ROLE_NAMES } from '#models/role'
import vine from '@vinejs/vine'

export const listAuditLogsValidator = vine.compile(
  vine.object({
    actor_id: vine.string().trim().maxLength(128).optional(),
    actor_role: vine.enum(ROLE_NAMES).optional(),
    method: vine.enum(AUDIT_METHODS).optional(),
    outcome: vine.enum(AUDIT_OUTCOMES).optional(),
    from: vine.date().optional(),
    to: vine.date().afterOrSameAs('from').optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    per_page: vine.number().min(1).max(100).withoutDecimals().optional(),
  })
)
