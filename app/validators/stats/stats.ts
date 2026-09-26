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
