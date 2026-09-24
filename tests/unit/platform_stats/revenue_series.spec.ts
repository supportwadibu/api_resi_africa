import { test } from '@japa/runner'

import { buildRevenueSeries, monthKey } from '#features/platform_stats/revenue_series'

import type { StatsBooking } from '#features/bookings/booking_stats'

function stay(start: string, end: string, amount: number): StatsBooking {
  return {
    status: 'completed',
    start_date: new Date(start),
    end_date: new Date(end),
    total_amount: amount,
  }
}

const NOW = new Date('2026-09-24T10:00:00Z')

test.group('buildRevenueSeries', () => {
  test('rend un point par mois, du plus ancien au mois en cours', ({ assert }) => {
    const series = buildRevenueSeries([], NOW, 3)

    assert.deepEqual(
      series.map((p) => p.month),
      ['2026-07', '2026-08', '2026-09']
    )
  })

  test('franchit la frontière d’année', ({ assert }) => {
    const series = buildRevenueSeries([], new Date('2026-01-15T00:00:00Z'), 2)

    assert.deepEqual(
      series.map((p) => p.month),
      ['2025-12', '2026-01']
    )
  })

  test('répartit un séjour à cheval au prorata des jours', ({ assert }) => {
    // Du 30 août midi au 2 septembre midi : 2 jours en août, 1 en septembre.
    const series = buildRevenueSeries(
      [stay('2026-08-30T12:00:00Z', '2026-09-02T12:00:00Z', 30000)],
      NOW,
      2
    )

    assert.equal(series[0].revenue + series[1].revenue, 30000)
    assert.isAbove(series[0].revenue, series[1].revenue)
  })

  test('compte un séjour dans le mois de son arrivée', ({ assert }) => {
    const series = buildRevenueSeries(
      [stay('2026-08-30T12:00:00Z', '2026-09-02T12:00:00Z', 30000)],
      NOW,
      2
    )

    assert.deepEqual(
      series.map((p) => p.bookings_started),
      [1, 0]
    )
  })

  test('ramène une durée nulle à un mois', ({ assert }) => {
    assert.lengthOf(buildRevenueSeries([], NOW, 0), 1)
  })
})

test.group('monthKey', () => {
  test('complète le mois sur deux chiffres', ({ assert }) => {
    assert.equal(monthKey(new Date(Date.UTC(2026, 2, 1))), '2026-03')
  })
})
