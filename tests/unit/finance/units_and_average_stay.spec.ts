import { test } from '@japa/runner'

import {
  bookingShareInWindow,
  rentedUnits,
  sumBookingShares,
  sumOccupiedDays,
} from '#features/finance/occupancy'
import { averageStay } from '#features/reports/metrics/average_stay'

const OCTOBER = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') }
const NOVEMBER = { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') }

/** 31 octobre 12 h → 3 novembre 12 h : 3 jours, dont 12 heures en octobre. */
const STRADDLING = {
  property_id: 'p1',
  start_date: new Date('2026-10-31T12:00:00Z'),
  end_date: new Date('2026-11-03T12:00:00Z'),
  days_count: 3,
}

test.group('bookingShareInWindow', () => {
  test('rend la part de la durée tombant dans la fenêtre', ({ assert }) => {
    assert.approximately(bookingShareInWindow(STRADDLING, OCTOBER.from, OCTOBER.to), 1 / 6, 1e-9)
    assert.approximately(bookingShareInWindow(STRADDLING, NOVEMBER.from, NOVEMBER.to), 5 / 6, 1e-9)
  })

  test('un séjour hors fenêtre a une part nulle', ({ assert }) => {
    const booking = {
      start_date: new Date('2026-09-10T12:00:00Z'),
      end_date: new Date('2026-09-12T12:00:00Z'),
    }
    assert.equal(bookingShareInWindow(booking, OCTOBER.from, OCTOBER.to), 0)
  })

  test('un séjour sans durée tombe entier dans la fenêtre de son entrée', ({ assert }) => {
    const at = new Date('2026-10-15T10:00:00Z')
    const booking = { start_date: at, end_date: at }
    assert.equal(bookingShareInWindow(booking, OCTOBER.from, OCTOBER.to), 1)
    assert.equal(bookingShareInWindow(booking, NOVEMBER.from, NOVEMBER.to), 0)
  })
})

test.group('séjour moyen au prorata', () => {
  test('un séjour à cheval garde sa durée dans chaque mois', ({ assert }) => {
    // Rapporté au nombre brut de réservations, le même séjour donnait 0,5 j en
    // octobre et 2,5 j en novembre.
    for (const month of [OCTOBER, NOVEMBER]) {
      const days = sumOccupiedDays([STRADDLING], month.from, month.to)
      const share = sumBookingShares([STRADDLING], month.from, month.to)
      assert.approximately(averageStay(days, share), 3, 1e-9)
    }
  })

  test('mêle séjours entiers et séjours coupés sans biais', ({ assert }) => {
    const inside = {
      property_id: 'p2',
      start_date: new Date('2026-10-10T12:00:00Z'),
      end_date: new Date('2026-10-11T12:00:00Z'),
      days_count: 1,
    }
    const bookings = [inside, STRADDLING]

    const days = sumOccupiedDays(bookings, OCTOBER.from, OCTOBER.to)
    const share = sumBookingShares(bookings, OCTOBER.from, OCTOBER.to)

    // 1 + 0,5 jours pour 1 + 1/6 réservation : (1,5) / (7/6).
    assert.approximately(averageStay(days, share), 1.5 / (7 / 6), 1e-9)
  })
})

test.group('rentedUnits', () => {
  test('compte chaque logement une fois, quel que soit le nombre de séjours', ({ assert }) => {
    const bookings = [
      STRADDLING,
      {
        ...STRADDLING,
        start_date: new Date('2026-10-02T12:00:00Z'),
        end_date: new Date('2026-10-04T12:00:00Z'),
      },
      {
        property_id: 'p2',
        start_date: new Date('2026-10-20T12:00:00Z'),
        end_date: new Date('2026-10-21T12:00:00Z'),
      },
    ]

    assert.equal(rentedUnits(bookings, OCTOBER.from, OCTOBER.to), 2)
  })

  test('suit la période : un logement sans séjour sur la fenêtre n’est pas loué', ({ assert }) => {
    const september = {
      property_id: 'p3',
      start_date: new Date('2026-09-05T12:00:00Z'),
      end_date: new Date('2026-09-07T12:00:00Z'),
    }

    assert.equal(rentedUnits([september], OCTOBER.from, OCTOBER.to), 0)
    assert.equal(rentedUnits([september], new Date('2026-09-01T00:00:00Z'), OCTOBER.from), 1)
  })

  test('ignore les logements hors de la capacité retenue', ({ assert }) => {
    // Unité sortie de la résidence depuis : sa réservation garde le
    // `residence_id` figé, mais elle ne pèse plus dans la capacité.
    assert.equal(rentedUnits([STRADDLING], OCTOBER.from, OCTOBER.to, new Set(['p2'])), 0)
    assert.equal(rentedUnits([STRADDLING], OCTOBER.from, OCTOBER.to, new Set(['p1'])), 1)
  })
})
