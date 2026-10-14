import { test } from '@japa/runner'
import {
  defaultCheckOutFor,
  resolveStayTypePrice,
  stayTypeOccupancyDays,
} from '#features/bookings/stay_type'

import type { PropertyPricing } from '#models/property'

const pricing: PropertyPricing = {
  daily_price: 20000,
  price_tiers: [],
  minimum_stay_days: 1,
  maximum_stay_days: null,
}

test.group('resolveStayTypePrice', () => {
  test('le séjour complet vaut le tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'full_day'), 20000)
  })

  test('la demi-journée vaut la moitié du tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'half_day'), 10000)
  })

  test('le passage vaut 30 % du tarif journalier', ({ assert }) => {
    assert.equal(resolveStayTypePrice(pricing, 'passage'), 6000)
  })

  test('le tarif dérivé est arrondi au franc', ({ assert }) => {
    // 15 001 × 0,3 = 4500,3 : un montant à virgule se propagerait
    // jusqu'au montant encaissé.
    const odd: PropertyPricing = { ...pricing, daily_price: 15001 }
    assert.equal(resolveStayTypePrice(odd, 'passage'), 4500)
  })
})

test.group('stayTypeOccupancyDays', () => {
  test('un séjour complet occupe le bien un jour par jour facturé', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('full_day', 3), 3)
  })

  test('une demi-journée occupe une demi-journée', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('half_day', 1), 0.5)
  })

  test('un passage occupe un quart de journée', ({ assert }) => {
    assert.equal(stayTypeOccupancyDays('passage', 1), 0.25)
  })
})

test.group('defaultCheckOutFor', () => {
  test('un séjour complet court 24 h', ({ assert }) => {
    const checkIn = new Date('2026-10-28T12:00:00.000Z')
    assert.equal(defaultCheckOutFor('full_day', checkIn).toISOString(), '2026-10-29T12:00:00.000Z')
  })

  test('une demi-journée court 12 h', ({ assert }) => {
    const checkIn = new Date('2026-10-28T12:00:00.000Z')
    assert.equal(defaultCheckOutFor('half_day', checkIn).toISOString(), '2026-10-29T00:00:00.000Z')
  })

  test('un passage court 4 h par défaut', ({ assert }) => {
    const checkIn = new Date('2026-10-28T14:00:00.000Z')
    assert.equal(defaultCheckOutFor('passage', checkIn).toISOString(), '2026-10-28T18:00:00.000Z')
  })
})
