import { test } from '@japa/runner'

import {
  attachCommission,
  readBookingCommission,
  toClientBooking,
} from '#features/commissions/booking_commission'
import {
  activeCommissionRule,
  assertValidCommissionSettings,
  markupDailyPrice,
  onlineBookingAmounts,
  ownerDailyPriceFor,
  priceOnlineStay,
  resolveCommissionSettings,
} from '#features/commissions/commission_rules'
import { commissionOfPayment, ownerAmountOf } from '#features/booking_payments/sponsorship_credit'

const pricing = {
  daily_price: 18000,
  price_tiers: [{ min_days: 7, discount_percent: 10 }],
  minimum_stay_days: 1,
  maximum_stay_days: null,
}
const start = new Date('2026-11-01T12:00:00Z')
const end = new Date('2026-11-04T12:00:00Z')

test.group('réglage de la commission', () => {
  test('coupée tant que le backoffice n’a rien enregistré', ({ assert }) => {
    assert.isNull(activeCommissionRule(resolveCommissionSettings(null)))
  })

  test('refuse un pourcentage au-delà de 100 et une commission active nulle', ({ assert }) => {
    assert.throws(() =>
      assertValidCommissionSettings({ enabled: true, mode: 'percent', value: 120 })
    )
    assert.throws(() => assertValidCommissionSettings({ enabled: true, mode: 'fixed', value: 0 }))
    assert.doesNotThrow(() =>
      assertValidCommissionSettings({ enabled: false, mode: 'fixed', value: 0 })
    )
  })
})

test.group('majoration du prix par nuit', () => {
  test('pourcentage ou montant fixe, arrondi au franc', ({ assert }) => {
    assert.equal(markupDailyPrice(18000, { mode: 'percent', value: 10 }), 19800)
    assert.equal(markupDailyPrice(18000, { mode: 'fixed', value: 2000 }), 20000)
    assert.equal(markupDailyPrice(12345, { mode: 'percent', value: 7 }), 13209)
    assert.equal(markupDailyPrice(18000, null), 18000)
  })

  test('une borne de recherche client se ramène au prix du propriétaire', ({ assert }) => {
    assert.equal(ownerDailyPriceFor(19800, { mode: 'percent', value: 10 }), 18000)
    assert.equal(ownerDailyPriceFor(20000, { mode: 'fixed', value: 2000 }), 18000)
  })
})

test.group('montants d’une réservation en ligne', () => {
  test('sépare la part du propriétaire de celle de RESI', ({ assert }) => {
    const amounts = onlineBookingAmounts(
      priceOnlineStay(pricing, start, end, { mode: 'fixed', value: 2000 }),
      0
    )
    assert.equal(amounts.daily_price, 18000)
    assert.equal(amounts.total_amount, 54000)
    assert.equal(amounts.client_daily_price, 20000)
    assert.equal(amounts.client_total_amount, 60000)
    assert.equal(amounts.commission_amount, 6000)
  })

  test('la remise de durée s’applique aux deux parts', ({ assert }) => {
    const week = new Date('2026-11-08T12:00:00Z')
    const amounts = onlineBookingAmounts(
      priceOnlineStay(pricing, start, week, { mode: 'percent', value: 10 }),
      0
    )
    assert.equal(amounts.total_amount, 113400)
    assert.equal(amounts.client_total_amount, 124740)
  })

  test('le code promo réduit la part de RESI, pas celle du propriétaire', ({ assert }) => {
    const amounts = onlineBookingAmounts(
      priceOnlineStay(pricing, start, end, { mode: 'percent', value: 10 }),
      2000
    )
    assert.equal(amounts.total_amount, 54000)
    assert.equal(amounts.client_total_amount, 57400)
    assert.equal(amounts.discount_amount, 2000)
  })

  test('commission coupée : montants d’avant la commission', ({ assert }) => {
    const amounts = onlineBookingAmounts(priceOnlineStay(pricing, start, end, null), 2000)
    assert.equal(amounts.total_amount, 52000)
    assert.isUndefined(amounts.commission_mode)
    assert.isUndefined(amounts.client_total_amount)
  })
})

test.group('vues d’une réservation', () => {
  const doc = {
    total_amount: 54000,
    commission_mode: 'percent' as const,
    commission_value: 10,
    commission_amount: 5400,
    client_daily_price: 19800,
    client_subtotal_amount: 59400,
    client_total_amount: 57400,
    discount_amount: 2000,
    promo_code: 'BIENVENUE',
  }

  test('la part de RESI ne sort jamais en JSON', ({ assert }) => {
    const dto = attachCommission({ total_amount: 54000 }, readBookingCommission(doc))
    assert.deepEqual(JSON.parse(JSON.stringify(dto)), { total_amount: 54000 })
  })

  test('RESI garde ce que paie le client moins la part du propriétaire', ({ assert }) => {
    assert.equal(readBookingCommission(doc)?.net_amount, 3400)
    assert.isNull(readBookingCommission({ total_amount: 54000 }))
  })

  test('le client voit ses propres prix', ({ assert }) => {
    const dto = attachCommission(
      {
        daily_price: 18000,
        subtotal_amount: 54000,
        total_amount: 54000,
        sponsorship_credit_amount: 400,
        amount_due: 53600,
        list_daily_price: 20000,
        discount_amount: 0,
        promo_code: null,
      },
      readBookingCommission(doc)
    )
    const view = toClientBooking(dto)
    assert.equal(view.daily_price, 19800)
    assert.equal(view.total_amount, 57400)
    assert.equal(view.amount_due, 57000)
    assert.equal(view.list_daily_price, 22000)
    // Code promo rendu au client : la vue propriétaire le masque.
    assert.equal(view.discount_amount, 2000)
    assert.equal(view.promo_code, 'BIENVENUE')
  })
})

test.group('commission d’un paiement', () => {
  test('part du propriétaire figée, ou tout l’encaissement sur l’historique', ({ assert }) => {
    const payment = {
      amount: 57000,
      metadata: { sponsorship_credit_amount: 400, owner_amount: 54000 },
    }
    assert.equal(ownerAmountOf(payment), 54000)
    assert.equal(commissionOfPayment(payment), 3400)
    assert.equal(ownerAmountOf({ amount: 30000, metadata: {} }), 30000)
    assert.equal(commissionOfPayment({ amount: 30000, metadata: {} }), 0)
  })
})
