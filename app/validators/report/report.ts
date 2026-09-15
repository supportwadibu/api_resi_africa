import vine from '@vinejs/vine'

/**
 * POST /proprio/reports
 *
 * `from` et `to` sont des dates nues, pas des instants : un rapport porte sur
 * des journées entières, et `to` est inclusif.
 */
export const generateReportValidator = vine.compile(
  vine.object({
    type: vine.enum(['financial', 'performance', 'reservations']),
    period: vine.enum(['this_month', 'last_month', 'this_year', 'custom']),
    from: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    residence_id: vine.string().trim().minLength(1).optional(),
  })
)
