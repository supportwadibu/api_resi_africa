import { test } from '@japa/runner'

import { cancellationTerms } from '#features/subscriptions/cancellation_policy'
import { grantContext, planGrant } from '#features/subscriptions/subscription_grant'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-19T10:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

const GRANT = {
  user_id: 'u1',
  plan_id: 'p1',
  plan_tier: 'pro' as const,
  duration_days: 30,
  amount: 15000,
  payment_method: 'cash' as const,
  external_reference: 'REC-42',
  transaction_reference: 'MAN-u1-x',
  admin_id: 'a1',
  note: 'Payé au bureau',
}

test.group('planGrant', () => {
  test('ouvre un abonnement actif de la durée du plan, au montant reçu', ({ assert }) => {
    const { subscription, close } = planGrant(GRANT, [], NOW)

    assert.equal(subscription.status, 'active')
    assert.isFalse(subscription.is_trial)
    assert.isTrue(subscription.recorded_by_admin)
    assert.equal(subscription.amount, 15000)
    assert.equal(subscription.daily_value, 500)
    assert.equal(subscription.payment_reference, 'MAN-u1-x')
    assert.deepEqual(subscription.end_date, inDays(30))
    assert.deepEqual(close, [])
  })

  test('enregistre un encaissement manuel, lu par le revenu de RESI', ({ assert }) => {
    const { payment } = planGrant(GRANT, [], NOW)

    assert.equal(payment?.provider, 'manual')
    assert.equal(payment?.status, 'success')
    assert.equal(payment?.amount, 15000)
    assert.equal(payment?.payment_method, 'cash')
    assert.equal(payment?.provider_transaction_id, 'REC-42')
    assert.deepEqual(payment?.paid_at, NOW)
  })

  test('un abonnement offert, à 0 F, n’écrit aucun paiement', ({ assert }) => {
    const { subscription, payment } = planGrant({ ...GRANT, amount: 0 }, [], NOW)

    assert.equal(subscription.amount, 0)
    assert.isNull(subscription.payment_reference)
    assert.isNull(payment)
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

  test('le code ne vaut que pour ce propriétaire, ce forfait et ce montant', ({ assert }) => {
    const base = grantContext({ user_id: 'u1', plan_id: 'p1', amount: 15000 })
    assert.notEqual(base, grantContext({ user_id: 'u2', plan_id: 'p1', amount: 15000 }))
    assert.notEqual(base, grantContext({ user_id: 'u1', plan_id: 'p2', amount: 15000 }))
    assert.notEqual(base, grantContext({ user_id: 'u1', plan_id: 'p1', amount: 10000 }))
  })

  test('résilié, un abonnement enregistré par un admin n’est pas remboursé', ({ assert }) => {
    const terms = cancellationTerms(
      { amount: 15000, start_date: NOW, plan_tier: 'pro', recorded_by_admin: true },
      inDays(1)
    )

    assert.deepEqual(terms, { mode: 'period_end', refund: 0, credit: 0, immediate: false })
  })
})
