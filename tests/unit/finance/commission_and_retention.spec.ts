import { test } from '@japa/runner'

import {
  aggregateGrossRevenue,
  isOperatingExpense,
  operatingExpensesTotal,
  retainedDepositsAsRevenue,
} from '#features/finance/repositories/finance_repository'

test.group('isOperatingExpense', () => {
  test('écarte le reflet de commission, déjà compté dans `commissions`', ({ assert }) => {
    assert.isFalse(isOperatingExpense({ category: 'commission' }))
    assert.isTrue(isOperatingExpense({ category: 'subscription' }))
    assert.isTrue(isOperatingExpense({ category: 'electricity' }))
  })

  test('retire les commissions du total agrégé', ({ assert }) => {
    const total = operatingExpensesTotal({
      total: 23000,
      by_category: [
        { category: 'electricity', amount: 15000 },
        { category: 'commission', amount: 5000 },
        { category: 'subscription', amount: 3000 },
      ],
    })

    // Un séjour de 50 000 F avec 5 000 F de commission : les 5 000 F ne sont
    // retranchés qu'une fois, via `commissions`.
    assert.equal(total, 18000)
  })
})

test.group('retainedDepositsAsRevenue', () => {
  test("impute l'acompte gardé au mois de l'annulation", ({ assert }) => {
    const revenue = retainedDepositsAsRevenue([
      { cancelled_at: new Date('2026-10-20T10:00:00Z'), retained_amount: 10000 },
    ])

    assert.equal(
      aggregateGrossRevenue(revenue, {
        from: new Date('2026-10-01T00:00:00Z'),
        to: new Date('2026-11-01T00:00:00Z'),
      }),
      10000
    )
    assert.equal(
      aggregateGrossRevenue(revenue, {
        from: new Date('2026-11-01T00:00:00Z'),
        to: new Date('2026-12-01T00:00:00Z'),
      }),
      0
    )
  })

  test('ignore une annulation sans acompte gardé', ({ assert }) => {
    assert.lengthOf(
      retainedDepositsAsRevenue([
        { cancelled_at: new Date('2026-10-20T10:00:00Z'), retained_amount: 0 },
        { cancelled_at: new Date('2026-10-20T10:00:00Z') },
      ]),
      0
    )
  })
})
