import vine from '@vinejs/vine'

import { DEPOSIT_TYPES } from '#features/deposits/deposit_rules'

/** Bornes larges : le pourcentage et l'entier sont revérifiés par les règles. */
const depositValue = vine.number().min(0).max(10_000_000)

export const updateDepositSettingsValidator = vine.compile(
  vine.object({
    enabled: vine.boolean(),
    owner_can_set: vine.boolean(),
    type: vine.enum(DEPOSIT_TYPES),
    value: depositValue,
  })
)

/** Réglage d'un logement par son propriétaire, dans la création et la modification du bien. */
export const propertyDepositSchema = vine
  .object({
    enabled: vine.boolean(),
    type: vine.enum(DEPOSIT_TYPES),
    value: depositValue,
  })
  .optional()
