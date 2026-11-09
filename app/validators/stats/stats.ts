import vine from '@vinejs/vine'

/**
 * GET /admin/stats/revenue
 *
 * Plafonné à deux ans : la série se calcule sur les réservations de toute la
 * fenêtre, et chaque mois ajouté élargit la lecture.
 */
/**
 * GET /admin/stats/subscriptions
 *
 * Deux ans en arrière au plus, un an en avant : au-delà, l'hypothèse de
 * renouvellement intégral n'a plus de sens.
 */
export const subscriptionRevenueValidator = vine.compile(
  vine.object({
    months_back: vine.number().positive().withoutDecimals().max(24).optional(),
    months_ahead: vine.number().positive().withoutDecimals().max(12).optional(),
  })
)

export const revenueSeriesValidator = vine.compile(
  vine.object({
    months: vine.number().positive().withoutDecimals().max(24).optional(),
  })
)

/**
 * GET /admin/stats/stay-types — même plafond de deux ans que la série du revenu.
 *
 * `from` (et `to`, facultatif) remplacent `months` par une période libre ; la
 * cohérence des deux dates est vérifiée par `stayBreakdownWindow`.
 */
export const stayTypeBreakdownValidator = vine.compile(
  vine.object({
    months: vine.number().positive().withoutDecimals().max(24).optional(),
    from: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    to: vine.date({ formats: ['YYYY-MM-DD'] }).optional(),
    owner_id: vine.string().trim().minLength(1).maxLength(128).optional(),
  })
)
