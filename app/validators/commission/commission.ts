import vine from '@vinejs/vine'

import { COMMISSION_MODES } from '#features/commissions/commission_rules'

export const updateCommissionSettingsValidator = vine.compile(
  vine.object({
    enabled: vine.boolean(),
    mode: vine.enum(COMMISSION_MODES),
    // Borne haute large : le pourcentage est revérifié par le use case, et un
    // montant fixe au-delà d'un million par nuit ne peut être qu'une faute de frappe.
    value: vine.number().min(0).max(1_000_000),
  })
)
