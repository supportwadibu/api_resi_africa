import { test } from '@japa/runner'

import { planGrant } from '#features/subscriptions/subscription_grant'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-19T10:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

const GRANT = { user_id: 'u1', plan_id: 'p1', plan_tier: 'pro' as const, duration_days: 30 }

test.group('planGrant', () => {
  test('ouvre un abonnement actif de la durée du plan, à 0 F', ({ assert }) => {
    const { subscription, close } = planGrant(GRANT, [], NOW)

    assert.equal(subscription.status, 'active')
    assert.isFalse(subscription.is_trial)
    assert.equal(subscription.plan_tier, 'pro')
    assert.deepEqual(subscription.start_date, NOW)
    assert.deepEqual(subscription.end_date, inDays(30))
    assert.deepEqual(close, [])
  })

  test('rien de payé, donc rien à rembourser ni à déduire', ({ assert }) => {
    const { subscription } = planGrant(GRANT, [], NOW)

    assert.equal(subscription.amount, 0)
    assert.equal(subscription.daily_value, 0)
    assert.isNull(subscription.payment_reference)
  })

  test('clôt un essai en cours', ({ assert }) => {
    const { close } = planGrant(
      GRANT,
      [{ _id: 't1', status: 'trial', is_trial: true, end_date: inDays(10) }],
      NOW
    )

    assert.deepEqual(close, [{ id: 't1', status: 'cancelled', reason: 'upgraded_to_plan' }])
  })

  test('clôt un paiement en attente et marque échu un abonnement dépassé', ({ assert }) => {
    const { close } = planGrant(
      GRANT,
      [
        { _id: 'w1', status: 'pending', is_trial: false, end_date: inDays(30) },
        { _id: 'a1', status: 'active', is_trial: false, end_date: inDays(-1) },
      ],
      NOW
    )

    assert.deepEqual(close, [
      { id: 'w1', status: 'cancelled', reason: 'superseded' },
      { id: 'a1', status: 'expired', reason: 'granted_by_admin' },
    ])
  })

  test('refuse si un abonnement payant est en cours', ({ assert }) => {
    assert.throws(
      () =>
        planGrant(
          GRANT,
          [{ _id: 'a1', status: 'active', is_trial: false, end_date: inDays(5) }],
          NOW
        ),
      "Ce propriétaire a déjà un abonnement payant en cours. Prolongez-le ou résiliez-le d'abord."
    )
  })
})
