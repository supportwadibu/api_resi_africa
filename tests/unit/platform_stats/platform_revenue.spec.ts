import { test } from '@japa/runner'

import {
  assertRevenueWindow,
  buildPlatformRevenue,
  commissionEvents,
  periodStart,
} from '#features/platform_stats/platform_revenue'

test.group('chiffre d’affaires de RESI', () => {
  test('la semaine commence le lundi', ({ assert }) => {
    // Le 2026-11-11 est un mercredi.
    const wednesday = new Date('2026-11-11T15:00:00Z')
    assert.equal(periodStart(wednesday, 'week').toISOString(), '2026-11-09T00:00:00.000Z')
    assert.equal(periodStart(wednesday, 'month').toISOString(), '2026-11-01T00:00:00.000Z')
  })

  test('cumule les sources par mois, parrainage en négatif', ({ assert }) => {
    const revenue = buildPlatformRevenue(
      [
        { source: 'commissions', amount: 5400, at: new Date('2026-10-03T10:00:00Z') },
        { source: 'subscriptions', amount: 3000, at: new Date('2026-10-15T10:00:00Z') },
        { source: 'withdrawal_fees', amount: 120, at: new Date('2026-11-02T10:00:00Z') },
        { source: 'sponsorship_rewards', amount: -270, at: new Date('2026-11-05T10:00:00Z') },
        // Hors période : ignoré.
        { source: 'subscriptions', amount: 3000, at: new Date('2026-09-30T23:00:00Z') },
      ],
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-12-01T00:00:00Z'),
      'month'
    )
    assert.deepEqual(
      revenue.series.map((p) => [p.period, p.net]),
      [
        ['2026-10-01', 8400],
        ['2026-11-01', -150],
      ]
    )
    assert.equal(revenue.totals.net, 8250)
    assert.equal(revenue.totals.sponsorship_rewards, -270)
    assert.equal(revenue.commissioned_bookings, 1)
  })

  test('un remboursement reprend la commission le jour du remboursement', ({ assert }) => {
    const events = commissionEvents({
      status: 'refunded',
      paid_at: new Date('2026-10-30T10:00:00Z'),
      refunded_at: new Date('2026-11-02T10:00:00Z'),
      commission: 5400,
    })
    assert.deepEqual(
      events.map((e) => e.amount),
      [5400, -5400]
    )
    assert.lengthOf(commissionEvents({ status: 'pending', paid_at: null, commission: 5400 }), 0)
  })

  test('refuse une période inversée ou une série démesurée', ({ assert }) => {
    const from = new Date('2026-01-01T00:00:00Z')
    assert.throws(() => assertRevenueWindow(from, from, 'month'))
    assert.throws(() => assertRevenueWindow(from, new Date('2028-01-01T00:00:00Z'), 'day'))
    assert.doesNotThrow(() => assertRevenueWindow(from, new Date('2028-01-01T00:00:00Z'), 'month'))
  })
})
