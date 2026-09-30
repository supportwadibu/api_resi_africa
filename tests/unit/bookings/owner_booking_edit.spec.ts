import { test } from '@japa/runner'

import {
  assertBookingEditable,
  buildEditPatch,
} from '#features/bookings/use_cases/update_owner_booking.use_case'
import { DomainError } from '#utils/domain_error'

const d = (iso: string) => new Date(iso)

function codeOf(fn: () => void): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not_a_domain_error'
  }
}

test.group('assertBookingEditable', () => {
  test('une réservation comptoir à venir se modifie', ({ assert }) => {
    assert.isNull(codeOf(() => assertBookingEditable({ status: 'confirmed', source: 'offline' })))
  })

  test('un séjour en cours se modifie encore', ({ assert }) => {
    assert.isNull(codeOf(() => assertBookingEditable({ status: 'in_progress', source: 'offline' })))
  })

  test('un séjour terminé ne se modifie plus', ({ assert }) => {
    assert.equal(
      codeOf(() => assertBookingEditable({ status: 'completed', source: 'offline' })),
      'booking_already_completed'
    )
  })

  test('une réservation annulée ne se modifie plus', ({ assert }) => {
    assert.equal(
      codeOf(() => assertBookingEditable({ status: 'cancelled', source: 'offline' })),
      'booking_cancelled'
    )
  })

  test('une réservation en ligne n’est pas réécrite au comptoir', ({ assert }) => {
    assert.equal(
      codeOf(() => assertBookingEditable({ status: 'confirmed', source: 'online' })),
      'booking_not_editable'
    )
  })

  test('une réservation sans canal vaut en ligne, comme l’historique', ({ assert }) => {
    assert.equal(
      codeOf(() => assertBookingEditable({ status: 'confirmed' })),
      'booking_not_editable'
    )
  })
})

test.group('buildEditPatch', () => {
  const base = {
    property: { id: 'p-2', residence_id: 'r-1', daily_price: 20000 },
    stay_type: 'full_day' as const,
    check_in_at: d('2026-10-10T12:00:00Z'),
    check_out_at: d('2026-10-13T12:00:00Z'),
    amounts: { days: 3, expected: 60000, discountPercent: 0 },
    deposit_amount: 10000,
    message: 'Chambre côté jardin',
  }

  test('les deux couples de dates sont écrits ensemble', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: 60000 })
    assert.deepEqual(patch.start_date, base.check_in_at)
    assert.deepEqual(patch.check_in_at, base.check_in_at)
    assert.deepEqual(patch.end_date, base.check_out_at)
    assert.deepEqual(patch.check_out_at, base.check_out_at)
  })

  test('le prix convenu devient le montant du séjour, l’écart une remise', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: 50000 })
    assert.equal(patch.total_amount, 50000)
    assert.equal(patch.received_amount, 50000)
    assert.equal(patch.expected_amount, 60000)
    assert.equal(patch.discount_amount, 10000)
  })

  test('sans prix convenu, le montant attendu s’applique', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: undefined })
    assert.equal(patch.total_amount, 60000)
    assert.equal(patch.discount_amount, 0)
  })

  test('un prix convenu au-dessus du tarif ne crée pas de remise négative', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: 70000 })
    assert.equal(patch.discount_amount, 0)
  })

  test('changer de logement réécrit le logement, la résidence et le tarif', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: 60000 })
    assert.equal(patch.property_id, 'p-2')
    assert.equal(patch.residence_id, 'r-1')
    assert.equal(patch.daily_price, 20000)
  })

  test('le client et le canal ne font jamais partie du patch', ({ assert }) => {
    const patch = buildEditPatch({ ...base, received_amount: 60000 })
    assert.notProperty(patch, 'client_id')
    assert.notProperty(patch, 'client_snapshot')
    assert.notProperty(patch, 'source')
    assert.notProperty(patch, 'status')
  })

  test('un message vidé s’efface', ({ assert }) => {
    const patch = buildEditPatch({ ...base, message: null, received_amount: 60000 })
    assert.isNull(patch.message)
  })
})
