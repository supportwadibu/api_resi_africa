import { test } from '@japa/runner'

import { calculateStayPrice, negotiatedPricing } from '#features/bookings/stay_pricing'
import {
  MAX_NEGOTIATION_STEPS,
  availableSteps,
  nextStep,
  normalizeNegotiation,
} from '#features/negotiations/negotiation_rules'

test.group('configuration de la négociation', () => {
  test('accepte des paliers décroissants sous le prix normal', ({ assert }) => {
    assert.deepEqual(normalizeNegotiation({ enabled: true, prices: [18000, 16000] }, 20000), {
      enabled: true,
      prices: [18000, 16000],
    })
  })

  test('refuse un palier au prix normal ou au-dessus', ({ assert }) => {
    assert.throws(() => normalizeNegotiation({ enabled: true, prices: [20000] }, 20000))
  })

  test('refuse un palier plus cher que le précédent', ({ assert }) => {
    assert.throws(() => normalizeNegotiation({ enabled: true, prices: [16000, 18000] }, 20000))
  })

  test('refuse une négociation activée sans palier', ({ assert }) => {
    assert.throws(() => normalizeNegotiation({ enabled: true, prices: [] }, 20000))
    assert.doesNotThrow(() => normalizeNegotiation({ enabled: false, prices: [] }, 20000))
  })

  test('borne le nombre de paliers', ({ assert }) => {
    const prices = Array.from({ length: MAX_NEGOTIATION_STEPS + 1 }, (_, i) => 19000 - i * 1000)
    assert.throws(() => normalizeNegotiation({ enabled: true, prices }, 20000))
  })
})

test.group('paliers révélés un à un', () => {
  const steps = [18000, 16000]

  test('le premier appui révèle le premier palier', ({ assert }) => {
    assert.deepEqual(nextStep([], steps), { status: 'offer', offers: [18000] })
  })

  test('« négocier encore » révèle le suivant', ({ assert }) => {
    assert.deepEqual(nextStep([18000], steps), { status: 'offer', offers: [18000, 16000] })
  })

  test('au-delà du dernier palier, la négociation s’arrête', ({ assert }) => {
    assert.deepEqual(nextStep([18000, 16000], steps), {
      status: 'exhausted',
      offers: [18000, 16000],
    })
  })

  test('un bien sans négociation le dit', ({ assert }) => {
    assert.deepEqual(nextStep([], []), { status: 'not_negotiable' })
    assert.deepEqual(nextStep([18000], []), { status: 'not_negotiable' })
  })

  test('négociation coupée ou palier passé au-dessus du prix normal : écartés', ({ assert }) => {
    assert.deepEqual(availableSteps({ enabled: false, prices: steps }, 20000), [])
    assert.deepEqual(availableSteps({ enabled: true, prices: steps }, 17000), [16000])
    assert.deepEqual(availableSteps(undefined, 20000), [])
  })
})

test.group('séjour au prix négocié', () => {
  test('le prix négocié est final : pas de remise de durée', ({ assert }) => {
    const pricing = {
      daily_price: 20000,
      price_tiers: [{ min_days: 7, discount_percent: 10 }],
      minimum_stay_days: 1,
      maximum_stay_days: null,
    }
    const start = new Date('2026-11-01T12:00:00Z')
    const end = new Date('2026-11-08T12:00:00Z')

    assert.equal(calculateStayPrice(pricing, start, end).subtotal, 126000)
    assert.equal(calculateStayPrice(negotiatedPricing(pricing, 16000), start, end).subtotal, 112000)
  })
})
