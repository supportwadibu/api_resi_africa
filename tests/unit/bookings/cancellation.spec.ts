import { test } from '@japa/runner'

import { buildCancellationPatch } from '#features/bookings/cancellation'
import { mirroredCommissionAmount } from '#features/bookings/referrer_expense'

const NOW = new Date('2026-10-20T10:00:00Z')

test.group('buildCancellationPatch', () => {
  test('sans acompte, aucun choix demandé', ({ assert }) => {
    const patch = buildCancellationPatch({ status: 'confirmed', deposit_amount: 0 }, {}, NOW)

    assert.equal(patch.status, 'cancelled')
    assert.isNull(patch.cancellation_deposit_action)
    assert.equal(patch.retained_amount, 0)
    assert.equal(patch.cancellation_refunded_amount, 0)
  })

  test("exige le sort de l'acompte quand il en a été versé un", ({ assert }) => {
    assert.throws(
      () => buildCancellationPatch({ status: 'confirmed', deposit_amount: 10000 }, {}, NOW),
      /déjà payé/
    )
  })

  test('acompte gardé : il reste un revenu', ({ assert }) => {
    const patch = buildCancellationPatch(
      { status: 'confirmed', deposit_amount: 10000 },
      { deposit_action: 'keep', reason: 'Annulation tardive' },
      NOW
    )

    assert.equal(patch.cancellation_deposit_action, 'keep')
    assert.equal(patch.retained_amount, 10000)
    assert.equal(patch.cancellation_refunded_amount, 0)
    assert.equal(patch.cancellation_reason, 'Annulation tardive')
  })

  test('acompte remboursé : rien ne reste en revenu', ({ assert }) => {
    const patch = buildCancellationPatch(
      { status: 'in_progress', deposit_amount: 10000 },
      { deposit_action: 'refund' },
      NOW
    )

    assert.equal(patch.retained_amount, 0)
    assert.equal(patch.cancellation_refunded_amount, 10000)
  })

  test('un paiement en ligne compte avec l’acompte', ({ assert }) => {
    assert.throws(
      () => buildCancellationPatch({ status: 'confirmed', online_paid_amount: 80000 }, {}, NOW),
      /déjà payé/
    )

    const patch = buildCancellationPatch(
      { status: 'confirmed', deposit_amount: 10000, online_paid_amount: 80000 },
      { deposit_action: 'refund' },
      NOW
    )
    assert.equal(patch.cancellation_refunded_amount, 90000)
    assert.equal(patch.retained_amount, 0)
  })

  test('refuse un séjour clôturé ou déjà annulé', ({ assert }) => {
    assert.throws(() => buildCancellationPatch({ status: 'completed' }, {}, NOW), /clôturé/)
    assert.throws(() => buildCancellationPatch({ status: 'cancelled' }, {}, NOW), /déjà annulée/)
  })
})

test.group('mirroredCommissionAmount', () => {
  const base = {
    _id: 'b1',
    owner_id: 'o1',
    property_id: 'p1',
    created_at: NOW,
    referrer: { name: 'Koffi', phone: null },
    referrer_commission_amount: 5000,
  }

  test('suit la commission de la réservation', ({ assert }) => {
    assert.equal(mirroredCommissionAmount({ ...base, status: 'confirmed' }), 5000)
  })

  test("tombe à zéro à l'annulation ou sans apporteur", ({ assert }) => {
    assert.equal(mirroredCommissionAmount({ ...base, status: 'cancelled' }), 0)
    assert.equal(mirroredCommissionAmount({ ...base, status: 'confirmed', referrer: null }), 0)
  })
})
