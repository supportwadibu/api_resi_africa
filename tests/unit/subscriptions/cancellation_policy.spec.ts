import { test } from '@japa/runner'

import {
  cancellationTerms,
  creditExpiry,
  usableCredit,
  waveFeeFor,
} from '#features/subscriptions/cancellation_policy'
import {
  buildPaidSubscription,
  isPaymentConsistent,
} from '#features/subscriptions/subscription_checkout'

const DAY = 24 * 60 * 60 * 1000
const PAID_AT = new Date('2026-10-01T10:00:00Z')
const dayAfter = (days: number) => new Date(PAID_AT.getTime() + days * DAY)

const pro = { plan_tier: 'pro' as const, amount: 3000, start_date: PAID_AT }
const proPlus = { plan_tier: 'pro_plus' as const, amount: 5000, start_date: PAID_AT }

test.group('annulation — 7 premiers jours', () => {
  test('Pro : tout est rendu, tout de suite', ({ assert }) => {
    assert.deepEqual(cancellationTerms(pro, dayAfter(6.9)), {
      mode: 'full_refund',
      refund: 3000,
      credit: 0,
      immediate: true,
    })
  })

  test('Pro+ : tout est rendu, tout de suite', ({ assert }) => {
    const terms = cancellationTerms(proPlus, dayAfter(0.1))
    assert.equal(terms.mode, 'full_refund')
    assert.equal(terms.refund, 5000)
  })

  test('un crédit consommé au paiement est rendu en crédit, pas en espèces', ({ assert }) => {
    const terms = cancellationTerms({ ...pro, amount: 1000, credit_applied: 2000 }, dayAfter(2))
    assert.equal(terms.refund, 1000)
    assert.equal(terms.credit, 2000)
  })
})

test.group('annulation — remboursement intégral déjà utilisé', () => {
  test('Pro : souscrire et résilier chaque semaine ne rend plus rien', ({ assert }) => {
    const terms = cancellationTerms(pro, dayAfter(2), { fullRefundAvailable: false })
    assert.equal(terms.mode, 'period_end')
    assert.equal(terms.refund, 0)
  })

  test('Pro+ : la deuxième semaine s’applique dès le premier jour', ({ assert }) => {
    const terms = cancellationTerms(proPlus, dayAfter(2), { fullRefundAvailable: false })
    assert.equal(terms.mode, 'partial_refund')
    assert.equal(terms.refund, 3000)
    assert.equal(terms.credit, 2000)
  })
})

test.group('crédit d’abonnement à l’activation', () => {
  const payment = {
    user_id: 'u1',
    plan_id: 'pro',
    plan_tier: 'pro' as const,
    duration_days: 30,
    amount: 1000,
    transaction_reference: 'SUB-1',
  }

  test('honoré en entier : la période est complète', ({ assert }) => {
    const { subscription } = buildPaidSubscription(
      { ...payment, subscription_credit: 2000, subscription_credit_declared: 2000 },
      null,
      PAID_AT
    )
    assert.equal(subscription.end_date.getTime(), dayAfter(30).getTime())
    assert.equal(subscription.credit_applied, 2000)
  })

  test('fondu entre-temps : seule la part payée ouvre des jours', ({ assert }) => {
    // 1 000 F versés et 2 000 F de crédit annoncés, mais plus de crédit à
    // l'activation : 1 000 F sur 3 000 F, soit 10 jours.
    const { subscription } = buildPaidSubscription(
      { ...payment, subscription_credit: 0, subscription_credit_declared: 2000 },
      null,
      PAID_AT
    )
    assert.equal(subscription.end_date.getTime(), dayAfter(10).getTime())
    assert.isNull(subscription.credit_applied)
  })
})

test.group('annulation — 8ᵉ au 14ᵉ jour', () => {
  test('Pro : rien n’est rendu, l’accès court jusqu’à l’échéance', ({ assert }) => {
    assert.deepEqual(cancellationTerms(pro, dayAfter(7)), {
      mode: 'period_end',
      refund: 0,
      credit: 0,
      immediate: false,
    })
  })

  test('Pro+ : 3 000 F rendus et 2 000 F de crédit bloqué', ({ assert }) => {
    assert.deepEqual(cancellationTerms(proPlus, dayAfter(13.9)), {
      mode: 'partial_refund',
      refund: 3000,
      credit: 2000,
      immediate: true,
    })
  })

  test('Pro+ payé avec un crédit : le crédit n’est pas changé en espèces', ({ assert }) => {
    // 3 000 F versés + 2 000 F de crédit : rendre 3 000 F en espèces et
    // 2 000 F de crédit offrirait deux semaines de Pro+ à chaque tour.
    const terms = cancellationTerms({ ...proPlus, amount: 3000, credit_applied: 2000 }, dayAfter(8))
    assert.equal(terms.refund, 1000)
    assert.equal(terms.credit, 2000)
  })

  test('Pro+ payé moins de 2 000 F : le crédit ne dépasse pas le versé', ({ assert }) => {
    const terms = cancellationTerms({ ...proPlus, amount: 1500 }, dayAfter(9))
    assert.equal(terms.refund, 0)
    assert.equal(terms.credit, 1500)
  })
})

test.group('annulation — à partir du 15ᵉ jour', () => {
  test('Pro+ : plus rien n’est rendu, l’accès court jusqu’à l’échéance', ({ assert }) => {
    const terms = cancellationTerms(proPlus, dayAfter(14))
    assert.equal(terms.mode, 'period_end')
    assert.equal(terms.refund, 0)
    assert.equal(terms.credit, 0)
    assert.isFalse(terms.immediate)
  })
})

test.group('crédit d’abonnement', () => {
  test('valable 90 jours', ({ assert }) => {
    assert.equal(creditExpiry(PAID_AT).getTime(), dayAfter(90).getTime())
  })

  test('un crédit expiré ou absent ne vaut rien', ({ assert }) => {
    assert.equal(usableCredit(null, PAID_AT), 0)
    assert.equal(usableCredit({ amount: 2000, expires_at: dayAfter(-1) }, PAID_AT), 0)
    assert.equal(usableCredit({ amount: 2000, expires_at: dayAfter(1) }, PAID_AT), 2000)
  })
})

test.group('frais Wave', () => {
  test('1 %, au franc supérieur', ({ assert }) => {
    assert.equal(waveFeeFor(5000), 50)
    assert.equal(waveFeeFor(3000), 30)
    assert.equal(waveFeeFor(1050), 11)
    assert.equal(waveFeeFor(0), 0)
  })

  test('la session Wave porte le prix et les frais', ({ assert }) => {
    const payment = { _id: 'SUB-1', amount: 5000, currency: 'XOF', metadata: { wave_fee: 50 } }
    assert.isTrue(
      isPaymentConsistent(payment, { amount: '5050', currency: 'XOF', client_reference: 'SUB-1' })
    )
    assert.isFalse(
      isPaymentConsistent(payment, { amount: '5000', currency: 'XOF', client_reference: 'SUB-1' })
    )
  })
})
