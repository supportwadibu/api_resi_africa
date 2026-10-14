import { test } from '@japa/runner'
import { computeOwnerBookingAmounts } from '#features/bookings/use_cases/create_owner_booking.use_case'

import type { PropertyPricing } from '#models/property'

const pricing: PropertyPricing = {
  daily_price: 20000,
  price_tiers: [],
  minimum_stay_days: 1,
  maximum_stay_days: null,
}

test.group('computeOwnerBookingAmounts', () => {
  test('un séjour complet de trois jours facture trois journées', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'full_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    )
    assert.equal(result.days, 3)
    assert.equal(result.expected, 60000)
  })

  test('une demi-journée facture la moitié du tarif journalier', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'half_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-29T00:00:00Z')
    )
    assert.equal(result.expected, 10000)
  })

  test('un passage facture 30 % du tarif journalier', ({ assert }) => {
    const result = computeOwnerBookingAmounts(
      pricing,
      'passage',
      new Date('2026-10-28T14:00:00Z'),
      new Date('2026-10-28T18:00:00Z')
    )
    assert.equal(result.expected, 6000)
  })

  test('un séjour infra-journalier compte au moins un jour facturé', ({ assert }) => {
    // `days_count` alimente Finance et l'affichage existant : une valeur nulle
    // y ferait disparaître la réservation.
    const result = computeOwnerBookingAmounts(
      pricing,
      'passage',
      new Date('2026-10-28T14:00:00Z'),
      new Date('2026-10-28T18:00:00Z')
    )
    assert.equal(result.days, 1)
  })

  test('une sortie antérieure à l’entrée est refusée', ({ assert }) => {
    assert.throws(() =>
      computeOwnerBookingAmounts(
        pricing,
        'full_day',
        new Date('2026-10-28T12:00:00Z'),
        new Date('2026-10-27T12:00:00Z')
      )
    )
  })

  test('le palier de durée remise un séjour complet, comme l’écran l’annonce', ({ assert }) => {
    // Sans palier côté serveur, le mobile annonçait 187 000 F et le serveur
    // enregistrait 220 000 F attendus : l'écart sortait en « remise » négociée.
    const tiered: PropertyPricing = {
      ...pricing,
      price_tiers: [
        { min_days: 7, discount_percent: 10 },
        { min_days: 10, discount_percent: 15 },
      ],
    }
    const result = computeOwnerBookingAmounts(
      tiered,
      'full_day',
      new Date('2026-09-25T12:00:00Z'),
      new Date('2026-10-06T12:00:00Z')
    )
    assert.equal(result.days, 11)
    assert.equal(result.discountPercent, 15)
    assert.equal(result.expected, 187000)
  })

  test('le palier de durée ne touche pas une demi-journée', ({ assert }) => {
    const tiered: PropertyPricing = {
      ...pricing,
      price_tiers: [{ min_days: 1, discount_percent: 20 }],
    }
    const result = computeOwnerBookingAmounts(
      tiered,
      'half_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-29T00:00:00Z')
    )
    assert.equal(result.discountPercent, 0)
    assert.equal(result.expected, 10000)
  })

  test('le minimum de séjour ne s’applique pas à une demi-journée', ({ assert }) => {
    // `minimum_stay_days` vaut 1 par défaut : l'y soumettre rendrait la
    // demi-journée impossible sur tout bien existant.
    const strict: PropertyPricing = { ...pricing, minimum_stay_days: 2 }
    const result = computeOwnerBookingAmounts(
      strict,
      'half_day',
      new Date('2026-10-28T12:00:00Z'),
      new Date('2026-10-29T00:00:00Z')
    )
    assert.equal(result.expected, 10000)
  })
})
