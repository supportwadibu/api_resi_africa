import { test } from '@japa/runner'

import {
  buildPaidSubscription,
  checkoutRefusal,
  isPaymentConsistent,
  RENEWAL_WINDOW_DAYS,
} from '#features/subscriptions/subscription_checkout'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-26T10:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

const PAYMENT = {
  user_id: 'owner-1',
  plan_id: 'plan-full',
  plan_tier: 'full' as const,
  duration_days: 30,
  amount: 5000,
  transaction_reference: 'SUB-owner-1-abc',
}

test.group('checkoutRefusal', () => {
  test('sans abonnement, pendant un essai ou après échéance : accepté', ({ assert }) => {
    assert.isNull(checkoutRefusal(null, 'basic', NOW))
    assert.isNull(
      checkoutRefusal({ status: 'trial', is_trial: true, end_date: inDays(10) }, 'basic', NOW)
    )
    assert.isNull(
      checkoutRefusal(
        { status: 'active', is_trial: false, plan_tier: 'full', end_date: inDays(-1) },
        'basic',
        NOW
      )
    )
  })

  test('abonnement payant loin de son échéance : refusé', ({ assert }) => {
    const refusal = checkoutRefusal(
      { status: 'active', is_trial: false, plan_tier: 'full', end_date: inDays(20) },
      'full',
      NOW
    )

    assert.equal(refusal?.code, 'subscription_already_active')
    assert.equal(refusal?.status, 409)
  })

  test('dans la fenêtre de renouvellement, le même palier est accepté', ({ assert }) => {
    assert.isNull(
      checkoutRefusal(
        {
          status: 'active',
          is_trial: false,
          plan_tier: 'basic',
          end_date: inDays(RENEWAL_WINDOW_DAYS),
        },
        'basic',
        NOW
      )
    )
  })

  test('dans la fenêtre, changer de palier est refusé : pas de switch en cours de période', ({
    assert,
  }) => {
    const refusal = checkoutRefusal(
      { status: 'active', is_trial: false, plan_tier: 'basic', end_date: inDays(3) },
      'full',
      NOW
    )

    assert.equal(refusal?.code, 'plan_change_not_allowed')
  })

  test("l'historique sans palier se renouvelle en forfait complet", ({ assert }) => {
    assert.isNull(
      checkoutRefusal({ status: 'active', is_trial: false, end_date: inDays(2) }, 'full', NOW)
    )
  })
})

test.group('buildPaidSubscription', () => {
  test('premier abonnement : la période commence maintenant, au palier payé', ({ assert }) => {
    const { subscription, close } = buildPaidSubscription(PAYMENT, null, NOW)

    assert.isNull(close)
    assert.equal(subscription.status, 'active')
    assert.isFalse(subscription.is_trial)
    assert.equal(subscription.plan_tier, 'full')
    assert.equal(subscription.amount, 5000)
    assert.equal(subscription.payment_reference, PAYMENT.transaction_reference)
    assert.deepEqual(subscription.end_date, inDays(30))
  })

  test("l'essai en cours est clos, sans report de ses jours", ({ assert }) => {
    const { subscription, close } = buildPaidSubscription(
      PAYMENT,
      { _id: 'trial-1', status: 'trial', is_trial: true, end_date: inDays(5) },
      NOW
    )

    assert.deepEqual(close, { id: 'trial-1', status: 'cancelled', reason: 'upgraded_to_plan' })
    assert.deepEqual(subscription.end_date, inDays(30))
  })

  test('un renouvellement anticipé reporte les jours restants', ({ assert }) => {
    const { subscription, close } = buildPaidSubscription(
      PAYMENT,
      { _id: 'sub-1', status: 'active', is_trial: false, plan_tier: 'full', end_date: inDays(4) },
      NOW
    )

    assert.deepEqual(close, { id: 'sub-1', status: 'cancelled', reason: 'renewed' })
    // Payer tôt ne fait rien perdre : 4 jours restants + 30 payés.
    assert.deepEqual(subscription.end_date, inDays(34))
    assert.deepEqual(subscription.start_date, NOW)
  })

  test("un abonnement échu que le cron n'a pas basculé est marqué expiré", ({ assert }) => {
    const { subscription, close } = buildPaidSubscription(
      PAYMENT,
      { _id: 'sub-old', status: 'active', is_trial: false, end_date: inDays(-2) },
      NOW
    )

    assert.equal(close?.status, 'expired')
    assert.deepEqual(subscription.end_date, inDays(30))
  })

  test('la durée figée sur le paiement fait foi', ({ assert }) => {
    const { subscription } = buildPaidSubscription({ ...PAYMENT, duration_days: 90 }, null, NOW)

    assert.deepEqual(subscription.end_date, inDays(90))
  })
})

test.group('isPaymentConsistent', () => {
  const payment = { _id: 'SUB-1', amount: 5000, currency: 'XOF' }

  test('montant, devise et référence identiques : cohérent', ({ assert }) => {
    assert.isTrue(
      isPaymentConsistent(payment, { amount: '5000', currency: 'xof', client_reference: 'SUB-1' })
    )
  })

  test('un montant inférieur ne vaut pas paiement du forfait', ({ assert }) => {
    assert.isFalse(
      isPaymentConsistent(payment, { amount: '100', currency: 'XOF', client_reference: 'SUB-1' })
    )
  })

  test("une autre devise ou la référence d'un autre paiement : incohérent", ({ assert }) => {
    assert.isFalse(
      isPaymentConsistent(payment, { amount: '5000', currency: 'EUR', client_reference: 'SUB-1' })
    )
    assert.isFalse(
      isPaymentConsistent(payment, { amount: '5000', currency: 'XOF', client_reference: 'SUB-2' })
    )
  })
})
