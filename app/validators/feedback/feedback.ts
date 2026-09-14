import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from '#models/feedback'
import vine from '@vinejs/vine'

/**
 * Contexte technique, entièrement facultatif.
 *
 * L'application le renseigne seule, mais une version ancienne peut ne rien
 * envoyer : refuser la requête pour cela perdrait un avis que l'utilisateur a
 * pris le temps d'écrire.
 */
const context = vine
  .object({
    app_version: vine.string().trim().maxLength(40).optional(),
    flavor: vine.string().trim().maxLength(20).optional(),
    platform: vine.string().trim().maxLength(20).optional(),
    os_version: vine.string().trim().maxLength(40).optional(),
    device_model: vine.string().trim().maxLength(80).optional(),
  })
  .optional()

export const createFeedbackValidator = vine.compile(
  vine.object({
    type: vine.enum(FEEDBACK_TYPES),
    title: vine.string().trim().minLength(3).maxLength(120),
    message: vine.string().trim().minLength(10).maxLength(2000),
    context,
  })
)

export const listFeedbacksValidator = vine.compile(
  vine.object({
    status: vine.enum(FEEDBACK_STATUSES).optional(),
    type: vine.enum(FEEDBACK_TYPES).optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    per_page: vine.number().min(1).max(100).withoutDecimals().optional(),
  })
)

export const updateFeedbackStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(FEEDBACK_STATUSES).optional(),
    admin_note: vine.string().trim().maxLength(2000).nullable().optional(),
  })
)
