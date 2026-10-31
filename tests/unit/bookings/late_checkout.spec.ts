import { test } from '@japa/runner'

import {
  calculateStayPrice,
  checkoutDeadline,
  extensionCheckOutFor,
  parseCheckoutTime,
  plannedCheckOutFor,
  resolveBilledStay,
  resolveLateCheckoutPolicy,
} from '#features/bookings/stay_pricing'

import type { PropertyPricing } from '#models/property'

const DEFAULTS = resolveLateCheckoutPolicy({})
const d = (iso: string) => new Date(iso)

test.group('resolveBilledStay — nuits à heure de départ fixe', () => {
  for (const arrival of ['10:00', '12:00', '15:00', '22:00']) {
    test(`arrivée ${arrival} → lendemain 12h30 : une nuit`, ({ assert }) => {
      assert.deepEqual(
        resolveBilledStay(d(`2026-10-19T${arrival}:00Z`), d('2026-10-20T12:30:00Z'), DEFAULTS),
        { days: 1, lateCheckout: false }
      )
    })
  }

  test('l’heure d’arrivée ne change ni la sortie prévue ni le prix', ({ assert }) => {
    const pricing: PropertyPricing = {
      daily_price: 20000,
      price_tiers: [],
      minimum_stay_days: 1,
      maximum_stay_days: null,
    }
    const early = plannedCheckOutFor(d('2026-10-19T08:00:00Z'), 1, pricing)
    const late = plannedCheckOutFor(d('2026-10-19T23:00:00Z'), 1, pricing)
    assert.equal(early.toISOString(), '2026-10-20T12:30:00.000Z')
    assert.equal(late.toISOString(), early.toISOString())

    const priceEarly = calculateStayPrice(pricing, d('2026-10-19T08:00:00Z'), early)
    const priceLate = calculateStayPrice(pricing, d('2026-10-19T23:00:00Z'), late)
    assert.equal(priceEarly.subtotal, 20000)
    assert.equal(priceLate.subtotal, priceEarly.subtotal)
  })

  test('plusieurs nuits : date d’arrivée + nuits, à 12h30', ({ assert }) => {
    const out = plannedCheckOutFor(d('2026-10-19T21:15:00Z'), 3, {})
    assert.equal(out.toISOString(), '2026-10-22T12:30:00.000Z')
    assert.deepEqual(resolveBilledStay(d('2026-10-19T21:15:00Z'), out, DEFAULTS), {
      days: 3,
      lateCheckout: false,
    })
  })

  test('une arrivée après minuit part le lendemain', ({ assert }) => {
    const out = plannedCheckOutFor(d('2026-10-20T02:00:00Z'), 1, {})
    assert.equal(out.toISOString(), '2026-10-21T12:30:00.000Z')
  })

  test('une sortie avant 12h30 le lendemain reste une nuit', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T15:00:00Z'), d('2026-10-20T09:00:00Z'), DEFAULTS),
      { days: 1, lateCheckout: false }
    )
  })

  test('un passage du mois franchit le calendrier', ({ assert }) => {
    assert.equal(
      plannedCheckOutFor(d('2026-10-30T18:00:00Z'), 3, {}).toISOString(),
      '2026-11-02T12:30:00.000Z'
    )
  })
})

test.group('resolveBilledStay — départ tardif mesuré dès 12h30', () => {
  test('dans la tolérance, le dépassement est offert', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T10:00:00Z'), d('2026-10-20T13:30:00Z'), DEFAULTS),
      { days: 1, lateCheckout: false }
    )
  })

  test('jusqu’à six heures, une demi-nuit', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T10:00:00Z'), d('2026-10-20T16:00:00Z'), DEFAULTS),
      { days: 1, lateCheckout: true }
    )
  })

  test('au-delà, une nuit de plus', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T10:00:00Z'), d('2026-10-20T19:00:00Z'), DEFAULTS),
      { days: 2, lateCheckout: false }
    )
  })

  test('un nombre de nuits choisi mesure le dépassement après sa dernière nuit', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T22:00:00Z'), d('2026-10-21T15:00:00Z'), DEFAULTS, 2),
      { days: 2, lateCheckout: true }
    )
  })
})

test.group('extensionCheckOutFor', () => {
  test('une sortie héritée du décompte en 24h est recalée sur 12h30', ({ assert }) => {
    // Entrée à 15h, sortie à 15h deux jours plus tard, prolongée d'un jour.
    const out = extensionCheckOutFor(d('2026-10-19T15:00:00Z'), d('2026-10-22T15:00:00Z'), {})
    assert.equal(out.toISOString(), '2026-10-22T12:30:00.000Z')
  })

  test('une sortie déjà à 12h30 reste inchangée', ({ assert }) => {
    const out = extensionCheckOutFor(d('2026-10-19T22:00:00Z'), d('2026-10-23T12:30:00Z'), {})
    assert.equal(out.toISOString(), '2026-10-23T12:30:00.000Z')
  })
})

test.group('heure de départ du bien', () => {
  test('les biens antérieurs prennent 12h30 et la règle par défaut', ({ assert }) => {
    assert.deepEqual(DEFAULTS, { checkoutMinutes: 750, graceMinutes: 60, halfDayHours: 6 })
  })

  test('l’heure du bien remplace 12h30', ({ assert }) => {
    const policy = resolveLateCheckoutPolicy({ checkout_time: '11:00' })
    assert.equal(policy.checkoutMinutes, 660)
    assert.equal(
      checkoutDeadline(d('2026-10-19T15:00:00Z'), 1, policy.checkoutMinutes).toISOString(),
      '2026-10-20T11:00:00.000Z'
    )
  })

  test('une heure mal formée retombe sur 12h30', ({ assert }) => {
    assert.equal(parseCheckoutTime('25:00'), 750)
    assert.equal(parseCheckoutTime('midi'), 750)
    assert.equal(parseCheckoutTime(null), 750)
  })
})

test.group('calculateStayPrice — départ tardif', () => {
  const pricing = {
    daily_price: 20000,
    price_tiers: [],
    minimum_stay_days: 1,
    maximum_stay_days: null,
  }

  test('ajoute la demi-nuit au sous-total', ({ assert }) => {
    const price = calculateStayPrice(pricing, d('2026-10-19T12:00:00Z'), d('2026-10-20T16:00:00Z'))
    assert.equal(price.days, 1)
    assert.equal(price.lateCheckoutFee, 10000)
    assert.equal(price.subtotal, 30000)
  })

  test('refuse une sortie antérieure à l’entrée', ({ assert }) => {
    assert.throws(() =>
      calculateStayPrice(pricing, d('2026-10-20T12:00:00Z'), d('2026-10-19T12:00:00Z'))
    )
  })
})
