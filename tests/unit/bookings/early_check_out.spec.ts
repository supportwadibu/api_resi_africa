import { test } from '@japa/runner'

import {
  buildEarlyCheckOutPatch,
  quoteEarlyCheckOut,
  type EarlyCheckOutBooking,
} from '#features/bookings/early_check_out'
import { aggregateRefunds } from '#features/finance/repositories/finance_repository'
import { splitRevenueByMonth } from '#features/finance/revenue_split'

const HOUR = 60 * 60 * 1000

/** Séjour comptoir de 5 jours à 20 000 F, entrée le 24 septembre à 9 h. */
function fiveDayStay(overrides: Partial<EarlyCheckOutBooking> = {}): EarlyCheckOutBooking {
  const checkIn = new Date('2026-09-24T09:00:00Z')
  const checkOut = new Date('2026-09-29T09:00:00Z')

  return {
    start_date: checkIn,
    end_date: checkOut,
    check_in_at: checkIn,
    check_out_at: checkOut,
    stay_type: 'full_day',
    days_count: 5,
    daily_price: 20000,
    subtotal_amount: 100000,
    expected_amount: 100000,
    received_amount: 100000,
    total_amount: 100000,
    ...overrides,
  }
}

function after(booking: EarlyCheckOutBooking, hours: number): Date {
  return new Date(booking.check_in_at!.getTime() + hours * HOUR)
}

test.group('quoteEarlyCheckOut', () => {
  test('facture les jours utilisés au prorata du montant réglé', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, 48)

    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.equal(quote.planned_days, 5)
    assert.equal(quote.billed_days, 2)
    assert.equal(quote.paid_amount, 100000)
    assert.equal(quote.proposed_amount, 40000)
    assert.equal(quote.refund_amount, 60000)
  })

  test('un jour entamé est dû', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, 51)

    assert.equal(quoteEarlyCheckOut(booking, departure, departure).billed_days, 3)
  })

  test('une demi-journée sur une journée complète reste facturée une journée', ({ assert }) => {
    const booking = fiveDayStay({
      end_date: new Date('2026-09-25T09:00:00Z'),
      check_out_at: new Date('2026-09-25T09:00:00Z'),
      days_count: 1,
      subtotal_amount: 20000,
      expected_amount: 20000,
      received_amount: 20000,
      total_amount: 20000,
    })
    const departure = after(booking, 12)

    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.equal(quote.billed_days, 1)
    assert.equal(quote.proposed_amount, 20000)
    assert.equal(quote.refund_amount, 0)
  })

  test('le prorata conserve la remise négociée', ({ assert }) => {
    // 100 000 F à la grille, 80 000 F convenus : 2 jours sur 5 valent 32 000 F.
    const booking = fiveDayStay({ received_amount: 80000, total_amount: 80000 })
    const departure = after(booking, 48)

    assert.equal(quoteEarlyCheckOut(booking, departure, departure).proposed_amount, 32000)
  })

  test('une réservation en ligne sans received_amount se proratise sur total_amount', ({
    assert,
  }) => {
    const booking = fiveDayStay({ received_amount: undefined, total_amount: 90000 })
    const departure = after(booking, 48)

    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.equal(quote.paid_amount, 90000)
    assert.equal(quote.proposed_amount, 36000)
  })

  test('une demi-journée se facture à l’unité, sans prorata', ({ assert }) => {
    const booking = fiveDayStay({
      stay_type: 'half_day',
      end_date: new Date('2026-09-24T21:00:00Z'),
      check_out_at: new Date('2026-09-24T21:00:00Z'),
      days_count: 1,
      received_amount: 10000,
      total_amount: 10000,
    })
    const departure = after(booking, 3)

    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.equal(quote.proposed_amount, 10000)
    assert.equal(quote.refund_amount, 0)
  })

  test('repli sur start_date / end_date pour l’historique', ({ assert }) => {
    const booking = fiveDayStay({
      check_in_at: undefined,
      check_out_at: undefined,
      days_count: undefined,
    })
    const departure = new Date(booking.start_date.getTime() + 48 * HOUR)

    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.equal(quote.planned_days, 5)
    assert.equal(quote.billed_days, 2)
  })

  test('refuse une sortie antérieure à l’entrée', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, -1)

    assert.throws(() => quoteEarlyCheckOut(booking, departure, after(booking, 10)))
  })

  test('refuse une sortie dans le futur', ({ assert }) => {
    const booking = fiveDayStay()

    assert.throws(() => quoteEarlyCheckOut(booking, after(booking, 48), after(booking, 24)))
  })

  test('refuse une sortie qui n’est pas anticipée', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, 5 * 24)

    assert.throws(() => quoteEarlyCheckOut(booking, departure, departure))
  })
})

test.group('buildEarlyCheckOutPatch', () => {
  test('réécrit la période et le montant ensemble, et fige la vente d’origine', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, 48)
    const quote = quoteEarlyCheckOut(booking, departure, departure)

    const patch = buildEarlyCheckOutPatch(booking, quote, 40000, departure)

    assert.equal(patch.status, 'completed')
    assert.deepEqual(patch.end_date, departure)
    assert.deepEqual(patch.check_out_at, departure)
    assert.deepEqual(patch.actual_check_out_at, departure)
    assert.equal(patch.days_count, 2)
    assert.equal(patch.total_amount, 40000)
    assert.equal(patch.received_amount, 40000)
    assert.equal(patch.expected_amount, 40000)
    assert.equal(patch.discount_amount, 0)
    assert.equal(patch.refunded_amount, 60000)
    assert.deepEqual(patch.planned_check_out_at, booking.check_out_at)
    assert.equal(patch.planned_days_count, 5)
    assert.equal(patch.planned_total_amount, 100000)
  })

  test('un montant retouché par le propriétaire est retenu', ({ assert }) => {
    const booking = fiveDayStay({ received_amount: 80000, total_amount: 80000 })
    const departure = after(booking, 48)
    const quote = quoteEarlyCheckOut(booking, departure, departure)

    const patch = buildEarlyCheckOutPatch(booking, quote, 35000, departure)

    assert.equal(patch.total_amount, 35000)
    assert.equal(patch.refunded_amount, 45000)
    // Grille de 2 jours à 20 000 F : 5 000 F de remise consentie.
    assert.equal(patch.discount_amount, 5000)
  })

  test('refuse un montant supérieur au montant réglé', ({ assert }) => {
    const booking = fiveDayStay()
    const departure = after(booking, 48)
    const quote = quoteEarlyCheckOut(booking, departure, departure)

    assert.throws(() => buildEarlyCheckOutPatch(booking, quote, 100001, departure))
    assert.throws(() => buildEarlyCheckOutPatch(booking, quote, -1, departure))
  })

  test('Finance répartit le montant réduit sur la période réduite', ({ assert }) => {
    // Séjour du 28 octobre au 2 novembre, quitté le 30 octobre : tout le
    // revenu restant appartient à octobre, rien ne fuit sur novembre.
    const checkIn = new Date('2026-10-28T12:00:00Z')
    const booking = fiveDayStay({
      start_date: checkIn,
      check_in_at: checkIn,
      end_date: new Date('2026-11-02T12:00:00Z'),
      check_out_at: new Date('2026-11-02T12:00:00Z'),
    })
    const departure = new Date('2026-10-30T12:00:00Z')
    const quote = quoteEarlyCheckOut(booking, departure, departure)
    const patch = buildEarlyCheckOutPatch(booking, quote, quote.proposed_amount, departure)

    const slices = splitRevenueByMonth(
      checkIn,
      patch.end_date as Date,
      patch.total_amount as number
    )

    assert.lengthOf(slices, 1)
    assert.equal(slices[0].amount, 40000)
  })
})

test.group('aggregateRefunds', () => {
  const range = {
    from: new Date('2026-10-01T00:00:00Z'),
    to: new Date('2026-11-01T00:00:00Z'),
  }

  test('somme les remboursements dont le départ tombe dans la fenêtre', ({ assert }) => {
    const total = aggregateRefunds(
      [
        { refunded_amount: 60000, actual_check_out_at: new Date('2026-10-12T10:00:00Z') },
        { refunded_amount: 5000, actual_check_out_at: new Date('2026-11-02T10:00:00Z') },
        { refunded_amount: 0, actual_check_out_at: new Date('2026-10-05T10:00:00Z') },
        {},
      ],
      range
    )

    assert.equal(total, 60000)
  })
})
