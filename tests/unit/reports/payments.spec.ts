import { test } from '@japa/runner'
import { buildSettlement, sumSettledPayments } from '#features/reports/metrics/payments'

const payments = [
  { booking_id: 'b1', amount: 50000, status: 'success' },
  { booking_id: 'b1', amount: 30000, status: 'success' },
  { booking_id: 'b1', amount: 20000, status: 'pending' },
  { booking_id: 'b1', amount: 90000, status: 'failed' },
  { booking_id: 'b2', amount: 70000, status: 'success' },
]

test.group('sumSettledPayments', () => {
  test('ne somme que les paiements aboutis de la réservation', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'b1'), 80000)
  })

  test('ignore les paiements des autres réservations', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'b2'), 70000)
  })

  test('rend 0 quand la réservation n’a aucun paiement', ({ assert }) => {
    assert.equal(sumSettledPayments(payments, 'inconnu'), 0)
  })
})

test.group('buildSettlement', () => {
  test('calcule le reste à percevoir', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b1', total_amount: 100000 }, payments)

    assert.equal(settlement.settled_amount, 80000)
    assert.equal(settlement.outstanding_amount, 20000)
    assert.isFalse(settlement.is_settled)
  })

  test('marque soldée une réservation entièrement payée', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b2', total_amount: 70000 }, payments)

    assert.equal(settlement.outstanding_amount, 0)
    assert.isTrue(settlement.is_settled)
  })

  test('un trop-perçu ne produit pas un reste négatif', ({ assert }) => {
    const settlement = buildSettlement({ id: 'b2', total_amount: 50000 }, payments)

    assert.equal(settlement.outstanding_amount, 0)
    assert.isTrue(settlement.is_settled)
  })

  test('une réservation comptoir sans paiement enregistré reste due', ({ assert }) => {
    const settlement = buildSettlement({ id: 'comptoir', total_amount: 40000 }, payments)

    assert.equal(settlement.settled_amount, 0)
    assert.equal(settlement.outstanding_amount, 40000)
  })
})
