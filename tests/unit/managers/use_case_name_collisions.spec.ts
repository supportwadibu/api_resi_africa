import { test } from '@japa/runner'

import * as bookingsUseCases from '#features/bookings/use_cases/index'
import * as clientsUseCases from '#features/clients/use_cases/index'

/**
 * Deux use cases ont longtemps porté le même nom : `ListClientBookingsUseCase`,
 * dans `bookings/` **et** dans `clients/`. L'un rend à l'appelant ses propres
 * réservations et ignore tout périmètre, l'autre lit la fiche d'un tiers et
 * cloisonne l'historique sur les logements confiés au gérant.
 *
 * Les deux `execute` prennent un `string` en premier argument : un import pris
 * au mauvais barrel compilait sans erreur et servait tout le parc du
 * propriétaire à un gérant. Le renommage en `ListMyBookingsUseCase` a levé
 * l'ambiguïté ; ce test empêche qu'elle revienne par une réunification des noms
 * ou par l'ajout d'un troisième homonyme.
 */
test.group('Homonymie des use cases entre barrels', () => {
  test('aucun nom exporté en commun entre les barrels bookings et clients', ({ assert }) => {
    const communs = Object.keys(bookingsUseCases).filter((nom) => nom in clientsUseCases)

    assert.deepEqual(
      communs,
      [],
      `Noms exportés par les deux barrels : ${communs.join(', ')}. ` +
        'Un import pris au mauvais barrel compilerait sans erreur.'
    )
  })

  test('le use case des réservations du client connecté ne prend pas de périmètre', ({
    assert,
  }) => {
    // `Function.length` ne compte que les paramètres précédant le premier qui
    // porte une valeur par défaut : `execute(client_id, input = {})` en déclare
    // donc 1, là où le use case cloisonné
    // `execute(clientId, ownerId, scopePropertyIds?)` en déclare 3. Si l'un
    // venait à prendre la place de l'autre, cette arité changerait.
    assert.equal(bookingsUseCases.ListMyBookingsUseCase.prototype.execute.length, 1)
    assert.equal(clientsUseCases.ListClientBookingsUseCase.prototype.execute.length, 3)
  })
})
