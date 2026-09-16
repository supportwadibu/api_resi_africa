import { test } from '@japa/runner'

import { filterClientsForScope } from '#features/clients/client_scope'

import type { ActorScope } from '#features/managers/scope'

const MANAGER: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['studio-1', 'studio-2'],
}

const OWNER: ActorScope = { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null }

const AWA = { _id: 'client-awa', created_by: null }
const BINTA = { _id: 'client-binta', created_by: null }
/** Fiche tout juste créée au comptoir : aucune réservation encore. */
const CODOU = { _id: 'client-codou', created_by: 'gerant-1' }
/** Fiche créée par un autre gérant, sans séjour dans le périmètre. */
const DIAMA = { _id: 'client-diama', created_by: 'gerant-2' }

const BOOKINGS = [
  // Awa a séjourné dans le périmètre.
  { client_id: 'client-awa', property_id: 'studio-1' },
  // Binta n'a séjourné que hors périmètre.
  { client_id: 'client-binta', property_id: 'studio-9' },
  { client_id: 'client-diama', property_id: 'studio-9' },
]

test.group('filterClientsForScope', () => {
  test('retient un client ayant séjourné dans le périmètre', ({ assert }) => {
    const kept = filterClientsForScope([AWA, BINTA], BOOKINGS, MANAGER)

    assert.deepEqual(
      kept.map((c) => c._id),
      ['client-awa']
    )
  })

  test('écarte un client n’ayant séjourné que hors périmètre', ({ assert }) => {
    // Les clients sont cloisonnés par `owner_id`, pas par logement : sans ce
    // filtrage, le gérant recevrait toute la clientèle du propriétaire.
    const kept = filterClientsForScope([BINTA], BOOKINGS, MANAGER)

    assert.isEmpty(kept)
  })

  test('retient une fiche créée par le gérant avant toute réservation', ({ assert }) => {
    // Sans cette branche, la fiche disparaîtrait entre sa création au comptoir
    // et la réservation qu'elle sert.
    const kept = filterClientsForScope([CODOU], BOOKINGS, MANAGER)

    assert.deepEqual(
      kept.map((c) => c._id),
      ['client-codou']
    )
  })

  test('écarte une fiche créée par un autre gérant sans séjour au périmètre', ({ assert }) => {
    const kept = filterClientsForScope([DIAMA], BOOKINGS, MANAGER)

    assert.isEmpty(kept)
  })

  test('un périmètre vide ne laisse passer aucun séjour', ({ assert }) => {
    const empty: ActorScope = { ...MANAGER, propertyIds: [] }
    const kept = filterClientsForScope([AWA, BINTA], BOOKINGS, empty)

    assert.isEmpty(kept)
  })

  test('un périmètre vide laisse passer les fiches créées par le gérant', ({ assert }) => {
    const empty: ActorScope = { ...MANAGER, propertyIds: [] }

    assert.lengthOf(filterClientsForScope([CODOU], BOOKINGS, empty), 1)
  })

  test('le propriétaire voit tout son carnet', ({ assert }) => {
    const kept = filterClientsForScope([AWA, BINTA, CODOU, DIAMA], BOOKINGS, OWNER)

    assert.lengthOf(kept, 4)
  })

  test('une réservation sans logement n’ouvre aucun périmètre', ({ assert }) => {
    const orphan = [{ client_id: 'client-binta', property_id: null }]

    assert.isEmpty(filterClientsForScope([BINTA], orphan, MANAGER))
  })
})
