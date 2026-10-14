import { PROMO_CODE_TYPES } from '#models/promo_code'

import vine from '@vinejs/vine'

/**
 * Champs facultatifs communs à la création et à la modification.
 *
 * Fabrique plutôt qu'objet partagé : chaque schéma compilé reçoit ses propres
 * nœuds. `value` n'est pas bornée selon le type ici — « un pourcentage ne
 * dépasse pas 100 » dépend de deux champs dont un seul peut figurer dans un
 * PATCH ; la règle est tenue par le use case, qui voit le code complet.
 */
function optionalFields() {
  // Même format que les dates de réservation : sans `formats`, `vine.date()`
  // rejette un horodatage ISO complet.
  const date = () =>
    vine
      .date({ formats: ['iso8601'] })
      .nullable()
      .optional()

  return {
    min_amount: vine.number().min(0).nullable().optional(),
    max_uses: vine.number().positive().withoutDecimals().nullable().optional(),
    max_uses_per_user: vine.number().positive().withoutDecimals().optional(),
    starts_at: date(),
    expires_at: date(),
    is_active: vine.boolean().optional(),
  }
}

/** POST /admin/promo-codes */
export const createPromoCodeValidator = vine.compile(
  vine.object({
    code: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(32)
      // Le code devient l'identifiant du document : `/` et `.` y sont
      // interdits par Firestore.
      .regex(/^[A-Za-z0-9_-]+$/),
    type: vine.enum(PROMO_CODE_TYPES),
    value: vine.number().positive(),
    ...optionalFields(),
  })
)

/** PATCH /admin/promo-codes/:id — le code lui-même n'est pas modifiable. */
export const updatePromoCodeValidator = vine.compile(
  vine.object({
    type: vine.enum(PROMO_CODE_TYPES).optional(),
    value: vine.number().positive().optional(),
    ...optionalFields(),
  })
)
