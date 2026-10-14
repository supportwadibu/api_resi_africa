import { test } from '@japa/runner'

import GerantClientController from '#controllers/gerant/client_controller'
import ClientRepository from '#features/clients/repositories/client_repository'
import { LookupClientUseCase } from '#features/clients/use_cases/index'
import Booking from '#models/booking'

import type { ActorScope } from '#features/managers/scope'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * `POST /gerant/clients/lookup` : la recherche par numéro ne sonde pas le
 * carnet du propriétaire.
 *
 * La route n'existait pas sous `gerant` et le mobile l'appelait quand même —
 * en débounce, pendant la saisie du téléphone au comptoir. L'échec était
 * silencieux, et le carnet du gérant se remplissait de doublons.
 *
 * L'ouvrir telle quelle aurait été pire que le défaut qu'elle corrige : la
 * recherche est cadrée sur `owner_id` seul, si bien qu'un numéro quelconque
 * livrait la fiche complète — pièce d'identité et cumuls compris — de
 * n'importe quel client du propriétaire. C'est précisément « sonder le carnet
 * du propriétaire avec un numéro ».
 *
 * Aucun de ces tests ne joint Firebase : le dépôt et le modèle sont remplacés
 * sur le prototype ou sur l'objet modèle.
 */

/** Périmètre d'un gérant à qui un seul logement est confié. */
const SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['in-scope'],
}

/** Fiche client réduite à ce que lisent la recherche et la conversion. */
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

test.group('POST /gerant/clients/lookup : la recherche ne franchit pas le périmètre', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Fiche que la recherche par téléphone trouvera. */
  function withExistingClient(record: ReturnType<typeof clientRecord> | null) {
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

  test('un client du périmètre est retrouvé', async ({ assert }) => {
    withExistingClient(clientRecord())
    // Le client a séjourné dans le logement confié au gérant.
    withStaysInScope(['cl-1'])

    const result = await new LookupClientUseCase().execute('owner-1', '0712345678', SCOPE)

    // C'est le cas nominal du comptoir : le gérant ressaisit un habitué et
    // l'application lui propose la fiche plutôt qu'un doublon.
    assert.isTrue(result.exists)
    assert.equal(result.client?.id, 'cl-1')
  })

  test('un client hors périmètre ne révèle rien, pas même son existence', async ({ assert }) => {
    withExistingClient(clientRecord())
    // Le client n'a séjourné que dans des logements non confiés.
    withStaysInScope([])

    const result = await new LookupClientUseCase().execute('owner-1', '0712345678', SCOPE)

    // Le point décisif : la réponse est celle d'un numéro inconnu. `exists:
    // true` avec une fiche omise serait lui-même l'oracle que la règle ferme,
    // puisque seule une fiche existante le distinguerait.
    assert.isFalse(result.exists)
    assert.isNull(result.client)

    // Formulé sur la sérialisation entière : une garde qui n'omettrait qu'un
    // champ à la fois laisserait passer tous les autres.
    assert.notInclude(JSON.stringify(result), 'CI-0099887766')
    assert.notInclude(JSON.stringify(result), 'Awa')
    assert.notInclude(JSON.stringify(result), '0712345678')
  })

  test('la réponse hors périmètre est identique à celle d’un numéro inconnu', async ({
    assert,
  }) => {
    withStaysInScope([])

    withExistingClient(clientRecord())
    const masked = await new LookupClientUseCase().execute('owner-1', '0712345678', SCOPE)

    withExistingClient(null)
    const unknown = await new LookupClientUseCase().execute('owner-1', '0712345678', SCOPE)

    // Indistinguables **octet pour octet** : c'est la seule formulation qui
    // ferme le recoupement. Un gérant qui compare deux réponses ne doit
    // déduire aucune différence.
    assert.deepEqual(masked, unknown)
    assert.equal(JSON.stringify(masked), JSON.stringify(unknown))
  })

  test('une fiche que le gérant a lui-même créée lui reste rendue', async ({ assert }) => {
    // Seconde branche de `retainClientsInScope` : une fiche saisie au comptoir
    // n'a, l'espace d'un instant, aucune réservation. Sans elle, le gérant ne
    // retrouverait pas le client qu'il vient d'enregistrer — et en créerait un
    // doublon, c'est-à-dire exactement le défaut que cette route corrige.
    withExistingClient(clientRecord({ created_by: 'gerant-1' }))
    withStaysInScope([])

    const result = await new LookupClientUseCase().execute('owner-1', '0712345678', SCOPE)

    assert.isTrue(result.exists)
    assert.equal(result.client?.id, 'cl-1')
  })

  test('un gérant sans aucun logement affecté ne retrouve personne', async ({ assert }) => {
    withExistingClient(clientRecord())
    withStaysInScope([])

    const result = await new LookupClientUseCase().execute('owner-1', '0712345678', {
      ownerId: 'owner-1',
      actorId: 'gerant-1',
      // L'invariant central : `[]` n'est pas `null`. Les confondre donnerait
      // tout le carnet du propriétaire à un gérant fraîchement créé.
      propertyIds: [],
    })

    assert.isFalse(result.exists)
    assert.isNull(result.client)
  })

  test('un gérant de 31 logements est filtré, pas servi en entier', async ({ assert }) => {
    // Au-delà de `FIRESTORE_IN_LIMIT`, `in` lève et le filtrage bascule en
    // mémoire. Une faille de cette forme exacte a déjà été trouvée sur ce
    // chantier : un gérant de plus de 30 logements voyait tout.
    const many = Array.from({ length: 31 }, (_, i) => `prop-${i}`)

    withExistingClient(clientRecord())
    withStaysInScope([])

    const masked = await new LookupClientUseCase().execute('owner-1', '0712345678', {
      ownerId: 'owner-1',
      actorId: 'gerant-1',
      propertyIds: many,
    })

    assert.isFalse(masked.exists)
    assert.isNull(masked.client)

    // Et le gérant de 31 logements retrouve bien ses propres clients : la
    // bascule mémoire doit filtrer, non tout refuser.
    withStaysInScope(['cl-1'])

    const found = await new LookupClientUseCase().execute('owner-1', '0712345678', {
      ownerId: 'owner-1',
      actorId: 'gerant-1',
      propertyIds: many,
    })

    assert.isTrue(found.exists)
    assert.equal(found.client?.id, 'cl-1')
  })

  test('le propriétaire retrouve son carnet entier', async ({ assert }) => {
    withExistingClient(clientRecord())

    // `propertyIds: null` : aucune restriction, et aucune lecture des séjours.
    // Si la garde en déclenchait une, ce test échouerait faute de stub.
    const result = await new LookupClientUseCase().execute('owner-1', '0712345678', {
      ownerId: 'owner-1',
      actorId: 'owner-1',
      propertyIds: null,
    })

    assert.isTrue(result.exists)
    assert.equal(result.client?.id, 'cl-1')
    assert.equal(result.client?.id_document_number, 'CI-0099887766')
  })

  test('un appelant sans périmètre garde le chemin d’avant le rôle gérant', async ({ assert }) => {
    withExistingClient(clientRecord())

    // Le contrôleur propriétaire ne transmet pas de périmètre : son
    // comportement ne doit pas changer.
    const result = await new LookupClientUseCase().execute('owner-1', '0712345678')

    assert.isTrue(result.exists)
    assert.equal(result.client?.id, 'cl-1')
  })

  test('un numéro inconnu reste le cas nominal, sans lecture des séjours', async ({ assert }) => {
    withExistingClient(null)

    // `Booking.findClientIdsInScope` n'est pas remplacé : s'il était appelé, le
    // test joindrait Firestore et échouerait. C'est le signal recherché — la
    // garde ne doit rien lire quand il n'y a aucune fiche à masquer.
    const result = await new LookupClientUseCase().execute('owner-1', '0700000000', SCOPE)

    assert.isFalse(result.exists)
    assert.isNull(result.client)
  })
})

/**
 * Le contrôleur transmet bien le périmètre au use case.
 *
 * Distinct du groupe ci-dessus, qui éprouve la **règle** : ce qui est en jeu
 * ici est la **ligne du contrôleur**. Le périmètre est facultatif sur le use
 * case — absent vaut « aucune restriction », pour que le chemin du
 * propriétaire reste inchangé. C'est commode et c'est le piège : un contrôleur
 * qui l'oublie, ou qui passe `null`, compile, s'exécute, rend une réponse
 * plausible — et sonde tout le carnet du propriétaire. Seule une assertion sur
 * l'argument réellement transmis attrape cette bévue.
 *
 * Même motif que `scope_guard_ordering.spec.ts`.
 */
test.group('le périmètre descend jusqu’au use case de recherche', (group) => {
  let received: unknown[] = []
  const restore: Array<() => void> = []

  group.each.setup(() => {
    received = []
  })

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Remplace `execute` et retient les arguments reçus. */
  function capture(target: { prototype: { execute: unknown } }, result: unknown = {}) {
    const original = target.prototype.execute

    target.prototype.execute = async (...args: unknown[]) => {
      received = args
      return result
    }

    restore.push(() => {
      target.prototype.execute = original
    })
  }

  test('POST /clients/lookup : la recherche porte sur le périmètre', async ({ assert }) => {
    capture(LookupClientUseCase, { exists: false, client: null })

    await new GerantClientController().lookup(ctx({ phone: '0712345678' }))

    const [ownerId, phone, passed] = received as [string, string, ActorScope | undefined]

    assert.equal(ownerId, 'owner-1')
    assert.equal(phone, '0712345678')
    // `undefined` ou `null` ici rouvrirait la porte que cette route ferme : le
    // use case servirait tout le carnet du propriétaire.
    assert.isDefined(passed)
    assert.deepEqual(passed?.propertyIds, ['in-scope'])
    assert.equal(passed?.actorId, 'gerant-1')
  })

  test('un gérant sans affectation transmet une liste vide, jamais `null`', async ({ assert }) => {
    capture(LookupClientUseCase, { exists: false, client: null })

    const empty = ctx({ phone: '0712345678' })
    empty.scope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] }

    await new GerantClientController().lookup(empty)

    const [, , passed] = received as [string, string, ActorScope | undefined]

    assert.deepEqual(passed?.propertyIds, [])
    assert.isNotNull(passed?.propertyIds)
  })
})

/** Périmètre d'un gérant à qui un seul logement est confié. */
function scope(): ActorScope {
  return { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: ['in-scope'] }
}

/**
 * Contexte HTTP réduit à ce que lit le contrôleur.
 *
 * `validateUsing` rend la charge utile telle quelle : la validation VineJS est
 * éprouvée ailleurs, et ce qui est en jeu ici est l'argument transmis.
 */
function ctx(payload: Record<string, unknown> = {}): HttpContext {
  return {
    params: { id: 'res-1' },
    scope: scope(),
    request: {
      qs: () => ({}),
      validateUsing: async () => payload,
    },
    response: {
      ok: (body: unknown) => body,
      created: (body: unknown) => body,
      noContent: () => undefined,
    },
  } as unknown as HttpContext
}
