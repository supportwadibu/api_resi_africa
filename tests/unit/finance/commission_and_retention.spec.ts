import { test } from '@japa/runner'

import {
  aggregateGrossRevenue,
  expenseTotals,
  expenseTotalsFromSummary,
  retainedDepositsAsRevenue,
} from '#features/finance/repositories/finance_repository'

test.group('expenseTotals', () => {
  test('la commission est une dépense comme les autres', ({ assert }) => {
    const totals = expenseTotals([
      { category: 'electricity', amount: 15000 },
      { category: 'commission', amount: 5000 },
      { category: 'subscription', amount: 3000 },
    ])

    // Comptée une seule fois, dans `depenses` ; `commissions` n'en est que le
    // détail.
    assert.deepEqual(totals, { depenses: 23000, commissions: 5000 })
  })

  test('même règle sur le total agrégé', ({ assert }) => {
    const totals = expenseTotalsFromSummary({
      total: 23000,
      by_category: [
        { category: 'electricity', amount: 15000 },
        { category: 'commission', amount: 5000 },
        { category: 'subscription', amount: 3000 },
      ],
    })

    assert.deepEqual(totals, { depenses: 23000, commissions: 5000 })
  })

  test('sans apporteur, aucune commission', ({ assert }) => {
    assert.deepEqual(expenseTotals([{ category: 'water', amount: 2000 }]), {
      depenses: 2000,
      commissions: 0,
    })
  })

  test('départ anticipé : la commission de l’enregistrement reste due', ({ assert }) => {
    // 5 jours à 10 000 F enregistrés, 5 000 F de commission. Le client part au
    // bout de 3 jours : le séjour ne rapporte plus que 30 000 F, mais la
    // commission, figée à l'enregistrement, reste 5 000 F.
    const september = {
      from: new Date('2026-09-01T00:00:00Z'),
      to: new Date('2026-10-01T00:00:00Z'),
    }
    const caBrut = aggregateGrossRevenue(
      [
        {
          start_date: new Date('2026-09-10T12:00:00Z'),
          end_date: new Date('2026-09-13T12:00:00Z'),
          total_amount: 30000,
        },
      ],
      september
    )
    const { depenses } = expenseTotals([{ category: 'commission', amount: 5000 }])

    assert.equal(caBrut - depenses, 25000)
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
