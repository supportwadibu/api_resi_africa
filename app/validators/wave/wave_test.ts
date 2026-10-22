import vine from '@vinejs/vine'

/**
 * POST /admin/wave-test/checkout
 *
 * Entier, Wave refusant les décimales en XOF. Plafonné : Wave n'a pas de bac à
 * sable, chaque essai débite un vrai compte, et une faute de frappe ne doit pas
 * coûter cent mille francs.
 */
export const waveTestCheckoutValidator = vine.compile(
  vine.object({
    amount: vine.number().withoutDecimals().min(100).max(1000),
  })
)
