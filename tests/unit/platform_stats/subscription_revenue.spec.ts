import { test } from '@japa/runner'

import { buildSubscriptionRevenue } from '#features/platform_stats/subscription_revenue'

const NOW = new Date('2026-09-26T10:00:00Z')

function build(overrides: Partial<Parameters<typeof buildSubscriptionRevenue>[0]> = {}) {
  return buildSubscriptionRevenue({
    payments: [],
    paidSubscriptions: [],
    trials: [],
    planPrices: [3000, 5000],
    now: NOW,
    monthsBack: 3,
    monthsAhead: 3,
    ...overrides,
  })
}

test.group('buildSubscriptionRevenue — encaissé', () => {
  test('rattache chaque paiement au mois où il a été reçu', ({ assert }) => {
    const revenue = build({
      payments: [
        { amount: 5000, paid_at: new Date('2026-07-03T09:00:00Z') },
        { amount: 3000, paid_at: new Date('2026-08-15T09:00:00Z') },
        { amount: 5000, paid_at: new Date('2026-08-20T09:00:00Z') },
        { amount: 3000, paid_at: new Date('2026-09-02T09:00:00Z') },
      ],
    })

    assert.deepEqual(
      revenue.earned.series.map((p) => [p.month, p.amount, p.count]),
      [
        ['2026-07', 5000, 1],
        ['2026-08', 8000, 2],
        ['2026-09', 3000, 1],
      ]
    )
    assert.equal(revenue.earned.total, 16000)
    assert.equal(revenue.earned.this_month, 3000)
    assert.equal(revenue.earned.previous_month, 8000)
    assert.equal(revenue.earned.growth_percent, -62.5)
  })
})

test.group('buildSubscriptionRevenue — récurrent et prévision', () => {
  const subscriptions = [
    // Mensuel à 5 000 F, échéance le 10 octobre.
    {
      amount: 5000,
      end_date: new Date('2026-10-10T10:00:00Z'),
      plan_tier: 'full' as const,
      duration_days: 30,
    },
    // Mensuel à 3 000 F, échéance le 28 septembre.
    {
      amount: 3000,
      end_date: new Date('2026-09-28T10:00:00Z'),
      plan_tier: 'basic' as const,
      duration_days: 30,
    },
    // Échu : ne compte plus.
    {
      amount: 5000,
      end_date: new Date('2026-09-01T10:00:00Z'),
      plan_tier: 'full' as const,
      duration_days: 30,
    },
  ]

  test('le revenu mensuel récurrent ignore les abonnements échus', ({ assert }) => {
    const revenue = build({ paidSubscriptions: subscriptions })

    assert.equal(revenue.recurring.paying_subscribers, 2)
    assert.equal(revenue.recurring.mrr, 8000)
    assert.deepEqual(revenue.recurring.by_tier, {
      basic: { subscribers: 1, mrr: 3000 },
      full: { subscribers: 1, mrr: 5000 },
    })
  })

  test('un abonnement de 90 jours pèse un tiers par mois', ({ assert }) => {
    const revenue = build({
      paidSubscriptions: [
        {
          amount: 15000,
          end_date: new Date('2026-12-01T00:00:00Z'),
          plan_tier: 'full',
          duration_days: 90,
        },
      ],
    })

    assert.equal(revenue.recurring.mrr, 5000)
  })

  test('déroule les renouvellements successifs sur la fenêtre', ({ assert }) => {
    const revenue = build({ paidSubscriptions: subscriptions })

    // Septembre : le 3 000 F du 28. Octobre : le 5 000 F du 10 et le 3 000 F
    // du 28. Novembre : 5 000 F le 9 et 3 000 F le 27.
    assert.deepEqual(
      revenue.forecast.series.map((p) => [p.month, p.amount, p.count]),
      [
        ['2026-09', 3000, 1],
        ['2026-10', 8000, 2],
        ['2026-11', 8000, 2],
      ]
    )
    assert.equal(revenue.forecast.total, 19000)
  })
})

test.group('buildSubscriptionRevenue — essais', () => {
  test('un potentiel à part, jamais compté dans la prévision', ({ assert }) => {
    const revenue = build({
      trials: [
        { end_date: new Date('2026-10-05T00:00:00Z') },
        { end_date: new Date('2026-11-30T00:00:00Z') },
        { end_date: new Date('2026-09-01T00:00:00Z') },
      ],
    })

    assert.equal(revenue.trials.in_progress, 2)
    assert.equal(revenue.trials.ending_within_30_days, 1)
    assert.equal(revenue.trials.potential_mrr_min, 6000)
    assert.equal(revenue.trials.potential_mrr_max, 10000)
    assert.equal(revenue.forecast.total, 0)
  })

  test('sans forfait proposé, aucun potentiel', ({ assert }) => {
    const revenue = build({
      trials: [{ end_date: new Date('2026-10-05T00:00:00Z') }],
      planPrices: [],
    })

    assert.equal(revenue.trials.potential_mrr_min, 0)
  })
})
