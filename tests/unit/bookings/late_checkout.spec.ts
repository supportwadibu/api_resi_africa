import { test } from '@japa/runner'

import {
  calculateStayPrice,
  resolveBilledStay,
  resolveLateCheckoutPolicy,
} from '#features/bookings/stay_pricing'

const DEFAULTS = resolveLateCheckoutPolicy({})
const d = (iso: string) => new Date(iso)

test.group('resolveBilledStay', () => {
  test('lundi 12h → mardi 16h : un jour et une demi-journée', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T12:00:00Z'), d('2026-10-20T16:00:00Z'), DEFAULTS),
      {
        days: 1,
        lateCheckout: true,
      }
    )
  })

  test('un dépassement dans la tolérance est offert', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T12:00:00Z'), d('2026-10-20T13:00:00Z'), DEFAULTS),
      {
        days: 1,
        lateCheckout: false,
      }
    )
  })

  test('au-delà de la demi-journée, le jour entamé est dû', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T12:00:00Z'), d('2026-10-20T19:00:00Z'), DEFAULTS),
      {
        days: 2,
        lateCheckout: false,
      }
    )
  })

  test('un séjour de moins de 24h vaut un jour', ({ assert }) => {
    assert.deepEqual(
      resolveBilledStay(d('2026-10-19T12:00:00Z'), d('2026-10-19T20:00:00Z'), DEFAULTS),
      {
        days: 1,
        lateCheckout: false,
      }
    )
  })

  test('les biens antérieurs prennent la règle par défaut', ({ assert }) => {
    assert.deepEqual(DEFAULTS, { graceMinutes: 60, halfDayHours: 6 })
  })
})

test.group('calculateStayPrice — départ tardif', () => {
  const pricing = {
    daily_price: 20000,
    price_tiers: [],
    minimum_stay_days: 1,
    maximum_stay_days: null,
  }

  test('ajoute la demi-journée au sous-total', ({ assert }) => {
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
