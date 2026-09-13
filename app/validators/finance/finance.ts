import vine from '@vinejs/vine'

/**
 * GET /proprio/finance/overview
 */
export const financeOverviewValidator = vine.compile(
  vine.object({
    from: vine.date().optional(),
    to: vine.date().optional(),
    /** Restreint le relevé à une résidence et à ses unités. */
    residence_id: vine.string().trim().minLength(1).optional(),
  })
)
