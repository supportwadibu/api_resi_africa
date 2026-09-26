import { test } from '@japa/runner'

import { elapsedWindow, occupancyForWindow } from '#features/bookings/booking_stats'
import { aggregateCommissions } from '#features/finance/repositories/finance_repository'

const SEPTEMBER = {
  from: new Date('2026-09-01T00:00:00Z'),
  to: new Date('2026-10-01T00:00:00Z'),
}

test.group('elapsedWindow', () => {
  test('un mois en cours est coupé à maintenant', ({ assert }) => {
    const now = new Date('2026-09-11T00:00:00Z')

    assert.deepEqual(elapsedWindow(SEPTEMBER, now), { from: SEPTEMBER.from, to: now })
  })

  test('un mois révolu garde sa borne', ({ assert }) => {
    assert.deepEqual(elapsedWindow(SEPTEMBER, new Date('2026-12-01T00:00:00Z')), SEPTEMBER)
  })

  test('une fenêtre future se réduit à un instant, jamais à un intervalle inversé', ({
    assert,
  }) => {
    const window = elapsedWindow(SEPTEMBER, new Date('2026-08-15T00:00:00Z'))

    assert.deepEqual(window, { from: SEPTEMBER.from, to: SEPTEMBER.from })
  })
})

test.group('taux d’occupation à date', () => {
  // Un logement, réservé du 1er au 11 (10 jours) puis du 20 au 30 (10 jours).
  const bookings = [
    {
      start_date: new Date('2026-09-01T12:00:00Z'),
      end_date: new Date('2026-09-11T12:00:00Z'),
      total_amount: 100000,
      status: 'completed',
      stay_type: 'full_day',
    },
    {
      start_date: new Date('2026-09-20T12:00:00Z'),
      end_date: new Date('2026-09-30T12:00:00Z'),
      total_amount: 100000,
      status: 'confirmed',
      stay_type: 'full_day',
    },
  ]

  test('le 11, un logement occupé depuis le 1er est plein', ({ assert }) => {
    const now = new Date('2026-09-11T12:00:00Z')

    // Rapporté au mois entier, le taux vaudrait ~33 % : le dénominateur
    // compterait déjà trente jours.
    assert.approximately(
      occupancyForWindow(bookings as never, 1, elapsedWindow(SEPTEMBER, now)),
      1,
      0.1
    )
  })

  test('les réservations à venir dans le mois ne comptent pas encore', ({ assert }) => {
    const now = new Date('2026-09-15T00:00:00Z')

    // 10 jours occupés sur 14 écoulés : la réservation du 20 n'entre pas.
    const rate = occupancyForWindow(bookings as never, 1, elapsedWindow(SEPTEMBER, now))
    assert.isBelow(rate, 0.8)
    assert.isAbove(rate, 0.6)
  })

  test('une fenêtre future vaut zéro', ({ assert }) => {
    const now = new Date('2026-08-15T00:00:00Z')

    assert.equal(occupancyForWindow(bookings as never, 1, elapsedWindow(SEPTEMBER, now)), 0)
  })
})

test.group('aggregateCommissions', () => {
  test('répartit la commission au prorata des jours, comme le chiffre d’affaires', ({ assert }) => {
    // 28 septembre → 4 octobre, 6 000 F de commission : 3 jours en septembre
    // sur 6, donc 3 000 F imputés à septembre.
    const bookings = [
      {
        start_date: new Date('2026-09-28T12:00:00Z'),
        end_date: new Date('2026-10-04T12:00:00Z'),
        referrer_commission_amount: 6000,
      },
    ]

    assert.equal(aggregateCommissions(bookings, SEPTEMBER), 3000)
  })

  test('les réservations sans apporteur ne comptent pas', ({ assert }) => {
    const bookings = [
      {
        start_date: new Date('2026-09-05T12:00:00Z'),
        end_date: new Date('2026-09-08T12:00:00Z'),
      },
    ]

    assert.equal(aggregateCommissions(bookings, SEPTEMBER), 0)
  })
})
