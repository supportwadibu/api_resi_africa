import vine from '@vinejs/vine'

/**
 * POST /proprio/reports
 *
 * `from` et `to` sont des dates nues, pas des instants : un rapport porte sur
 * des journées entières, et `to` est inclusif.
 */
export const generateReportValidator = vine.compile(
  vine.object({
    type: vine.enum(['financial', 'performance', 'reservations', 'police']),
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
    /** Registre de police seulement ; ignorée par les autres rapports. */
    commune: vine.string().trim().maxLength(80).optional(),
  })
)

/**
 * POST /admin/owners/:id/reports/police
 *
 * Mêmes bornes que `generateReportValidator`, sans `type` : la route n'édite
 * que le registre de police, le seul document que l'administration ait à
 * produire pour le compte d'un propriétaire.
 */
export const generatePoliceReportValidator = vine.compile(
  vine.object({
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
    /** Registre de police seulement ; ignorée par les autres rapports. */
    commune: vine.string().trim().maxLength(80).optional(),
  })
)
