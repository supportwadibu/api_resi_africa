import { test } from '@japa/runner'

import { buildOwnerBookingPayload } from '#models/booking'
import { buildScopedWrite } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

const MANAGER: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['studio-1'],
}

const OWNER: ActorScope = { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null }

test.group('buildScopedWrite', () => {
  test('une saisie de gérant appartient au propriétaire', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, MANAGER)

    assert.equal(payload.owner_id, 'owner-1')
  })

  test('une saisie de gérant porte son auteur réel', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, MANAGER)

    assert.equal(payload.created_by, 'gerant-1')
  })

  test('une saisie du propriétaire ne porte pas d’auteur distinct', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, OWNER)

    assert.equal(payload.owner_id, 'owner-1')
    assert.isNull(payload.created_by)
  })

  test('une saisie hors périmètre est refusée', ({ assert }) => {
    assert.throws(() => buildScopedWrite({ property_id: 'studio-9' }, MANAGER))
  })
})

const BOOKING_INPUT = {
  owner_id: 'owner-1',
  property_id: 'studio-1',
  residence_id: 'res-1',
  client_id: 'client-1',
  client_snapshot: { full_name: 'Awa', phone: '+2250101010101' },
  status: 'confirmed' as const,
  stay_type: 'full_day' as const,
  check_in_at: new Date('2026-03-01T12:00:00.000Z'),
  check_out_at: new Date('2026-03-03T12:00:00.000Z'),
  days_count: 2,
  daily_price: 20000,
  expected_amount: 40000,
  received_amount: 40000,
  deposit_amount: 0,
  message: null,
  client_request_id: null,
}

/**
 * `createOwnerBooking` énumère ses champs un à un pour composer le document.
 * Un `created_by` correctement calculé en amont s'y perdrait **sans aucune
 * erreur de compilation** : ces tests verrouillent le dernier maillon, là où
 * l'oubli serait silencieux.
 */
test.group('buildOwnerBookingPayload', () => {
  test('reporte l’auteur réel dans la charge utile', ({ assert }) => {
    const payload = buildOwnerBookingPayload(
      { ...BOOKING_INPUT, created_by: 'gerant-1' },
      new Date('2026-02-01T00:00:00.000Z')
    )

    assert.equal(payload.created_by, 'gerant-1')
  })

  test('laisse l’auteur nul quand il n’est pas transmis', ({ assert }) => {
    const payload = buildOwnerBookingPayload(BOOKING_INPUT, new Date('2026-02-01T00:00:00.000Z'))

    assert.isNull(payload.created_by)
  })

  test('la saisie d’un gérant reste la propriété du propriétaire', ({ assert }) => {
    const scoped = buildScopedWrite({ property_id: 'studio-1' }, MANAGER)

    const payload = buildOwnerBookingPayload(
      { ...BOOKING_INPUT, owner_id: scoped.owner_id, created_by: scoped.created_by },
      new Date('2026-02-01T00:00:00.000Z')
    )

    assert.equal(payload.owner_id, 'owner-1')
    assert.equal(payload.created_by, 'gerant-1')
  })
})
