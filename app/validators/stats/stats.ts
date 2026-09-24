import vine from '@vinejs/vine'

/**
 * GET /admin/stats/revenue
 *
 * Plafonné à deux ans : la série se calcule sur les réservations de toute la
 * fenêtre, et chaque mois ajouté élargit la lecture.
 */
export const revenueSeriesValidator = vine.compile(
  vine.object({
    months: vine.number().positive().withoutDecimals().max(24).optional(),
  })
)
