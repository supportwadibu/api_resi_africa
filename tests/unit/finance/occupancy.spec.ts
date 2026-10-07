import { test } from '@japa/runner'

import {
  exploitedUnits,
  occupancyRate,
  occupiedDaysInWindow,
  sumOccupiedDays,
  windowDays,
} from '#features/finance/occupancy'

const SEPTEMBER = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') }
const OCTOBER = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') }

test.group('occupiedDaysInWindow', () => {
  test('un séjour à cheval sur deux mois ne compte que ses jours vendus', ({ assert }) => {
    // 30 septembre 14 h → 2 octobre 14 h : 2 jours vendus. L'ancien calcul en
    // jours entamés en imputait 1 à septembre et 2 à octobre, soit 3.
    const booking = {
      start_date: new Date('2026-09-30T14:00:00Z'),
      end_date: new Date('2026-10-02T14:00:00Z'),
      days_count: 2,
    }

    const september = occupiedDaysInWindow(booking, SEPTEMBER.from, SEPTEMBER.to)
    const october = occupiedDaysInWindow(booking, OCTOBER.from, OCTOBER.to)

    assert.approximately(september, 10 / 24, 1e-9)
    assert.approximately(october, 38 / 24, 1e-9)
    assert.approximately(september + october, 2, 1e-9)
  })

  test('un jour entamé reste un jour vendu', ({ assert }) => {
    // Entrée 14 h, sortie le lendemain 12 h : 22 heures, facturées 1 jour.
    const booking = {
      start_date: new Date('2026-10-02T14:00:00Z'),
      end_date: new Date('2026-10-03T12:00:00Z'),
      days_count: 1,
    }

    assert.equal(occupiedDaysInWindow(booking, OCTOBER.from, OCTOBER.to), 1)
  })

  test('la demi-journée et le passage restent pondérés', ({ assert }) => {
    const base = {
      start_date: new Date('2026-10-02T08:00:00Z'),
      end_date: new Date('2026-10-02T20:00:00Z'),
      days_count: 1,
    }

    assert.equal(occupiedDaysInWindow({ ...base, stay_type: 'half_day' }), 0.5)
    assert.equal(occupiedDaysInWindow({ ...base, stay_type: 'passage' }), 0.25)
  })

  test('un type inconnu vaut un séjour complet, jamais NaN', ({ assert }) => {
    const booking = {
      start_date: new Date('2026-10-02T08:00:00Z'),
      end_date: new Date('2026-10-03T08:00:00Z'),
      days_count: 1,
      stay_type: 'weekend',
    }

    assert.equal(occupiedDaysInWindow(booking), 1)
  })

  test('repli sur nights_count puis sur la période', ({ assert }) => {
    const start = new Date('2026-10-02T12:00:00Z')
    const end = new Date('2026-10-05T12:00:00Z')

    assert.equal(occupiedDaysInWindow({ start_date: start, end_date: end, nights_count: 3 }), 3)
    assert.equal(occupiedDaysInWindow({ start_date: start, end_date: end }), 3)
  })

  test('un séjour hors fenêtre ne compte rien', ({ assert }) => {
    const booking = {
      start_date: new Date('2026-09-05T12:00:00Z'),
      end_date: new Date('2026-09-08T12:00:00Z'),
      days_count: 3,
    }

    assert.equal(occupiedDaysInWindow(booking, OCTOBER.from, OCTOBER.to), 0)
  })
})

test.group('occupancyRate', () => {
  test('la capacité est la durée exacte de la fenêtre', ({ assert }) => {
    assert.equal(windowDays(SEPTEMBER.from, SEPTEMBER.to), 30)
    assert.approximately(windowDays(OCTOBER.from, new Date('2026-10-07T12:00:00Z')), 6.5, 1e-9)
  })

  test('deux logements dont un plein sur la fenêtre : 50 %', ({ assert }) => {
    const bookings = [
      {
        start_date: SEPTEMBER.from,
        end_date: SEPTEMBER.to,
        days_count: 30,
      },
    ]

    assert.equal(occupancyRate(bookings, 2, SEPTEMBER.from, SEPTEMBER.to), 0.5)
  })

  test('sans parc ou sur une fenêtre vide, le taux est nul', ({ assert }) => {
    const bookings = [{ start_date: SEPTEMBER.from, end_date: SEPTEMBER.to, days_count: 30 }]

    assert.equal(occupancyRate(bookings, 0, SEPTEMBER.from, SEPTEMBER.to), 0)
    assert.equal(occupancyRate(bookings, 1, SEPTEMBER.from, SEPTEMBER.from), 0)
  })

  test('des réservations qui se chevauchent sont plafonnées à 100 %', ({ assert }) => {
    const booking = { start_date: SEPTEMBER.from, end_date: SEPTEMBER.to, days_count: 30 }

    assert.equal(occupancyRate([booking, booking], 1, SEPTEMBER.from, SEPTEMBER.to), 1)
  })

  test('la somme des mois égale les jours vendus', ({ assert }) => {
    const bookings = [
      {
        start_date: new Date('2026-09-28T12:00:00Z'),
        end_date: new Date('2026-10-04T12:00:00Z'),
        days_count: 6,
      },
    ]

    assert.approximately(
      sumOccupiedDays(bookings, SEPTEMBER.from, SEPTEMBER.to) +
        sumOccupiedDays(bookings, OCTOBER.from, OCTOBER.to),
      6,
      1e-9
    )
  })
})

test.group('exploitedUnits', () => {
  test('brouillons et logements réservés restent au parc ; seuls les inactifs en sortent', ({
    assert,
  }) => {
    assert.equal(exploitedUnits({ total: 5, inactive: 1 }), 4)
    assert.equal(exploitedUnits({ total: 3 }), 3)
  })
})
