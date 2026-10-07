import { test } from '@japa/runner'
import { splitRevenueByMonth } from '#features/finance/revenue_split'

test.group('splitRevenueByMonth', () => {
  test('un séjour tenant dans un seul mois produit une seule tranche', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-10-10T12:00:00.000Z'),
      new Date('2026-10-13T12:00:00.000Z'),
      30000
    )

    assert.lengthOf(slices, 1)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 3, amount: 30000 })
  })

  test('un séjour à cheval répartit au prorata des jours de chaque mois', ({ assert }) => {
    // Le cas de référence : 28 oct → 3 nov, 6 jours, 60 000 F.
    // Octobre en porte 4 (28, 29, 30, 31), novembre 2.
    const slices = splitRevenueByMonth(
      new Date('2026-10-28T12:00:00.000Z'),
      new Date('2026-11-03T12:00:00.000Z'),
      60000
    )

    assert.lengthOf(slices, 2)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 4, amount: 40000 })
    assert.deepEqual(slices[1], { year: 2026, month: 10, days: 2, amount: 20000 })
  })

  test('la somme des tranches égale toujours le montant total', ({ assert }) => {
    // 100 000 / 3 jours ne tombe pas juste : le reste va sur la dernière
    // tranche, sinon des francs disparaissent du chiffre d'affaires.
    const slices = splitRevenueByMonth(
      new Date('2026-10-30T12:00:00.000Z'),
      new Date('2026-11-02T12:00:00.000Z'),
      100000
    )

    const total = slices.reduce((sum, slice) => sum + slice.amount, 0)
    assert.equal(total, 100000)
  })

  test('un séjour couvrant trois mois produit trois tranches', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-10-30T12:00:00.000Z'),
      new Date('2026-12-02T12:00:00.000Z'),
      330000
    )

    assert.lengthOf(slices, 3)
    assert.deepEqual(
      slices.map((s) => s.month),
      [9, 10, 11]
    )
    assert.equal(
      slices.reduce((sum, s) => sum + s.amount, 0),
      330000
    )
  })

  test('un séjour à cheval sur deux années sépare les tranches', ({ assert }) => {
    const slices = splitRevenueByMonth(
      new Date('2026-12-30T12:00:00.000Z'),
      new Date('2027-01-02T12:00:00.000Z'),
      30000
    )

    assert.lengthOf(slices, 2)
    assert.deepEqual(slices[0], { year: 2026, month: 11, days: 2, amount: 20000 })
    assert.deepEqual(slices[1], { year: 2027, month: 0, days: 1, amount: 10000 })
  })

  test('un séjour de moins d’une journée compte pour un jour entier', ({ assert }) => {
    // Un passage de 4 h ne doit pas produire une tranche à zéro jour, qui
    // ferait disparaître son montant du chiffre d'affaires.
    const slices = splitRevenueByMonth(
      new Date('2026-10-28T14:00:00.000Z'),
      new Date('2026-10-28T18:00:00.000Z'),
      6000
    )

    assert.lengthOf(slices, 1)
    assert.deepEqual(slices[0], { year: 2026, month: 9, days: 1, amount: 6000 })
  })
})
