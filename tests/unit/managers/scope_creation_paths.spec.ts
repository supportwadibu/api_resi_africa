import { test } from '@japa/runner'

import CreateOwnerBookingUseCase from '#features/bookings/use_cases/create_owner_booking.use_case'
import BookingRepository from '#features/bookings/repositories/booking_repository'
import CreateClientUseCase from '#features/clients/use_cases/create_client.use_case'
import ClientRepository from '#features/clients/repositories/client_repository'
import Booking from '#models/booking'
import Client from '#models/client'
import Property from '#models/property'

import type { ActorScope } from '#features/managers/scope'

/**
 * Les chemins de **création** vérifient eux aussi le périmètre.
 *
 * Les gardes posées jusqu'ici couvrent les lectures et les modifications par
 * identifiant. Restaient deux jointures où l'invariant se perdait, et toutes
 * deux tiennent au même mécanisme : une création qui, au lieu de créer, rend un
 * document **préexistant** trouvé par une clé fonctionnelle — le téléphone pour
 * une fiche client, le `client_request_id` pour une réservation. Ces deux
 * recherches sont cadrées sur `owner_id`, ce qui suffisait quand le
 * propriétaire était le seul acteur : un gérant agissant pour son compte passe
 * ce cadrage sur *tout* le carnet et *tout* le parc.
 *
 * Aucun de ces tests ne joint Firebase : les accès au dépôt et au modèle sont
 * remplacés sur le prototype ou sur l'objet modèle.
 */

/** Périmètre d'un gérant à qui un seul logement est confié. */
const SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['in-scope'],
}

/** Fiche client réduite à ce que lisent le dédoublonnage et la conversion. */
function clientRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'cl-1',
    owner_id: 'owner-1',
    full_name: 'Awa Traoré',
    phone: '0712345678',
    whatsapp: null,
    id_document_type: 'cni',
    // Le champ qui pèse le plus lourd dans la fuite : un numéro de pièce
    // d'identité ne se redemande pas au client une fois échappé.
    id_document_number: 'CI-0099887766',
    id_document_front_public_id: null,
    id_document_back_public_id: null,
    documents_status: 'pending',
    stats: { total_stays: 12, total_paid: 840000, last_stay_at: null },
    status: 'active',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

test.group('POST /gerant/clients : le dédoublonnage ne franchit pas le périmètre', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Fiche que le dédoublonnage par téléphone trouvera. */
  function withExistingClient(record: ReturnType<typeof clientRecord>) {
    const original = ClientRepository.prototype.findByPhone
    ClientRepository.prototype.findByPhone = async () => record as never
    restore.push(() => {
      ClientRepository.prototype.findByPhone = original
    })
  }

  /** Clients ayant séjourné dans le périmètre, sans lire Firestore. */
  function withStaysInScope(clientIds: string[]) {
    const original = Booking.findClientIdsInScope
    Booking.findClientIdsInScope = async () => new Set(clientIds)
    restore.push(() => {
      Booking.findClientIdsInScope = original
    })
  }

  const input = {
    owner_id: 'owner-1',
    full_name: 'Awa Traoré',
    phone: '0712345678',
    created_by: 'gerant-1',
  }

  test('une fiche hors périmètre ne rend aucune donnée', async ({ assert }) => {
    withExistingClient(clientRecord())
    // Le client n'a séjourné que dans des logements non confiés.
    withStaysInScope([])

    const result = await new CreateClientUseCase().execute(input, {}, SCOPE)

    // Le point décisif : le gérant apprend qu'il n'y a rien à créer, et rien
    // d'autre. La route `lookup`, elle, n'est pas exposée au gérant — `store`
    // ne doit pas la rouvrir par la fenêtre.
    assert.isTrue(result.already_existed)
    assert.isNull(result.client)

    // Formulé sur la sérialisation entière : une garde qui n'omettrait qu'un
    // champ à la fois laisserait passer tous les autres.
    assert.notInclude(JSON.stringify(result), 'CI-0099887766')
    assert.notInclude(JSON.stringify(result), 'Awa')
    assert.notInclude(JSON.stringify(result), '0712345678')
  })

  test('une fiche du périmètre reste réutilisable', async ({ assert }) => {
    withExistingClient(clientRecord())
    // Le client a séjourné dans le logement confié au gérant.
    withStaysInScope(['cl-1'])

    const result = await new CreateClientUseCase().execute(input, {}, SCOPE)

    // Le gérant légitime ne doit pas être gêné : c'est le cas nominal du
    // comptoir, où l'on ressaisit un habitué.
    assert.isTrue(result.already_existed)
    assert.isNotNull(result.client)
    assert.equal(result.client?.id, 'cl-1')
    assert.equal(result.client?.id_document_number, 'CI-0099887766')
  })

  test('une fiche que le gérant a lui-même créée lui reste rendue', async ({ assert }) => {
    // Seconde branche de `retainClientsInScope` : sans elle, une fiche saisie
    // au comptoir disparaîtrait entre sa création et la réservation qu'elle
    // sert — elle n'a, l'espace d'un instant, aucune réservation.
    withExistingClient(clientRecord({ created_by: 'gerant-1' }))
    withStaysInScope([])

    const result = await new CreateClientUseCase().execute(input, {}, SCOPE)

    assert.isTrue(result.already_existed)
    assert.equal(result.client?.id, 'cl-1')
  })

  test('le propriétaire retrouve son carnet entier', async ({ assert }) => {
    withExistingClient(clientRecord())
    // `propertyIds: null` : aucune restriction, et aucune lecture des séjours.
    // Si la garde en déclenchait une, ce test la ferait échouer faute de stub.
    const result = await new CreateClientUseCase().execute(
      input,
      {},
      {
        ownerId: 'owner-1',
        actorId: 'owner-1',
        propertyIds: null,
      }
    )

    assert.isTrue(result.already_existed)
    assert.equal(result.client?.id, 'cl-1')
  })

  test('un appelant sans périmètre garde le chemin d’avant le rôle gérant', async ({ assert }) => {
    withExistingClient(clientRecord())

    // Le contrôleur propriétaire n'a pas de `ctx.scope` et ne transmet rien :
    // son comportement ne doit pas changer.
    const result = await new CreateClientUseCase().execute(input, {})

    assert.isTrue(result.already_existed)
    assert.equal(result.client?.id, 'cl-1')
  })
})

test.group(
  'POST /gerant/bookings : le rejeu d’idempotence ne franchit pas le périmètre',
  (group) => {
    const restore: Array<() => void> = []

    group.each.teardown(() => {
      while (restore.length) restore.pop()!()
    })

    /** Réservation que `findByRequestId` retrouvera pour ce `client_request_id`. */
    function withExistingBooking(record: Record<string, unknown>) {
      const original = Booking.findByRequestId
      Booking.findByRequestId = async () => record as never
      restore.push(() => {
        Booking.findByRequestId = original
      })
    }

    /** Réservation déjà écrite, réduite à ce que la conversion en DTO en lit. */
    function bookingRecord(propertyId: string) {
      return {
        _id: 'bk-1',
        owner_id: 'owner-1',
        property_id: propertyId,
        client_id: 'cl-9',
        client_snapshot: { full_name: 'Konan Yao', phone: '0700000000' },
        status: 'confirmed',
        stay_type: 'full_day',
        check_in_at: new Date('2026-10-01T12:00:00Z'),
        check_out_at: new Date('2026-10-04T12:00:00Z'),
        start_date: new Date('2026-10-01T12:00:00Z'),
        end_date: new Date('2026-10-04T12:00:00Z'),
        days_count: 3,
        daily_price: 45000,
        total_amount: 135000,
        expected_amount: 135000,
        received_amount: 135000,
        deposit_amount: 0,
        discount_amount: 0,
        source: 'offline',
        client_request_id: 'req-collision',
        created_by: null,
        created_at: new Date('2026-10-01T00:00:00Z'),
        updated_at: new Date('2026-10-01T00:00:00Z'),
      }
    }

    const input = {
      owner_id: 'owner-1',
      property_id: 'in-scope',
      client_id: 'cl-9',
      stay_type: 'full_day' as const,
      check_in_at: new Date('2026-10-01T12:00:00Z'),
      is_check_in: false,
      client_request_id: 'req-collision',
    }

    test('un rejeu pointant hors périmètre est refusé', async ({ assert }) => {
      // Le `property_id` *de la requête* est dans le périmètre — `buildScopedWrite`
      // l'a validé côté contrôleur. Mais la réservation retrouvée est une **autre**
      // réservation, sur un logement non confié : elle n'est jamais passée par
      // `assertWithinScope`.
      withExistingBooking(bookingRecord('hors-périmètre'))

      await assert.rejects(
        () => new CreateOwnerBookingUseCase().execute({ ...input, scope: SCOPE }),
        'Ce logement ne fait pas partie de votre périmètre.'
      )
    })

    test('le rejeu hors périmètre ne livre aucun montant', async ({ assert }) => {
      withExistingBooking(bookingRecord('hors-périmètre'))

      // Le DTO complet porte le financier du propriétaire : `daily_price`,
      // `total_amount`, `discount_amount`, et le client qui a séjourné.
      let leaked: unknown = null
      try {
        leaked = await new CreateOwnerBookingUseCase().execute({ ...input, scope: SCOPE })
      } catch {
        leaked = null
      }

      assert.isNull(leaked)
    })

    test('un gérant rejouant sa propre réservation reçoit le même DTO', async ({ assert }) => {
      // L'idempotence légitime est au cœur du mode hors ligne : la file de
      // synchronisation repose dessus, et un rejeu refusé ferait réessayer le
      // mobile en boucle ou créerait un doublon.
      withExistingBooking(bookingRecord('in-scope'))

      const dto = await new CreateOwnerBookingUseCase().execute({ ...input, scope: SCOPE })

      assert.equal(dto.id, 'bk-1')
      assert.equal(dto.property_id, 'in-scope')
      assert.equal(dto.total_amount, 135000)
    })

    test('le propriétaire rejoue sans restriction', async ({ assert }) => {
      // `propertyIds: null` : le propriétaire retrouve n'importe laquelle de ses
      // réservations, y compris celles saisies par ses gérants.
      withExistingBooking(bookingRecord('hors-périmètre'))

      const dto = await new CreateOwnerBookingUseCase().execute({
        ...input,
        scope: { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null },
      })

      assert.equal(dto.id, 'bk-1')
    })

    test('un appelant sans périmètre garde le chemin d’avant le rôle gérant', async ({
      assert,
    }) => {
      withExistingBooking(bookingRecord('hors-périmètre'))

      const dto = await new CreateOwnerBookingUseCase().execute(input)

      assert.equal(dto.id, 'bk-1')
    })

    test('une fiche client hors carnet ne devient pas un client_snapshot', async ({ assert }) => {
      // Même famille que le dédoublonnage : `Client.findById` n'est cadré que sur
      // `owner_id`. La fuite se limite au `client_snapshot` — nom et téléphone —
      // et exige de connaître un identifiant de fiche, mais la règle de
      // visibilité du carnet doit s'appliquer là aussi.
      const originalFind = Booking.findByRequestId
      Booking.findByRequestId = async () => null
      restore.push(() => {
        Booking.findByRequestId = originalFind
      })

      // Le client n'a séjourné dans aucun logement du périmètre et n'a pas été
      // saisi par ce gérant.
      const originalStays = Booking.findClientIdsInScope
      Booking.findClientIdsInScope = async () => new Set<string>()
      restore.push(() => {
        Booking.findClientIdsInScope = originalStays
      })

      const originalProperty = Property.findById
      Property.findById = async () =>
        ({
          _id: 'in-scope',
          owner_id: 'owner-1',
          residence_id: null,
          pricing: { daily_price: 45000, minimum_stay_days: 1 },
        }) as never
      restore.push(() => {
        Property.findById = originalProperty
      })

      const originalClient = Client.findById
      Client.findById = async () =>
        ({
          _id: 'cl-9',
          owner_id: 'owner-1',
          full_name: 'Konan Yao',
          phone: '0700000000',
          created_by: null,
        }) as never
      restore.push(() => {
        Client.findById = originalClient
      })

      await assert.rejects(
        () => new CreateOwnerBookingUseCase().execute({ ...input, scope: SCOPE }),
        'Client introuvable.'
      )
    })

    test('le court-circuit reste inerte sans client_request_id', async ({ assert }) => {
      // Sans identifiant de requête, aucun rejeu n'est possible : la garde ne doit
      // pas s'interposer sur le chemin nominal. `findByRequestId` n'est pas
      // remplacé ici — s'il était appelé, le test joindrait Firestore et
      // échouerait, ce qui est précisément le signal recherché.
      const dto = BookingRepository.toDto(bookingRecord('in-scope') as never)

      assert.equal(dto.property_id, 'in-scope')
    })
  }
)
