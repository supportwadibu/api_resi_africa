import { test } from '@japa/runner'

import ExpenseRepository from '#features/expenses/repositories/expense_repository'
import ListClientBookingsUseCase from '#features/clients/use_cases/list_client_bookings.use_case'
import ClientRepository from '#features/clients/repositories/client_repository'
import CheckOutBookingUseCase from '#features/bookings/use_cases/check_out_booking.use_case'
import FindOwnerBookingUseCase from '#features/bookings/use_cases/find_owner_booking.use_case'
import ExtendOwnerBookingUseCase from '#features/bookings/use_cases/extend_owner_booking.use_case'
import { assertWithinScope, FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import Booking from '#models/booking'
import Expense, { matchesInMemory } from '#models/expense'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { ActorScope } from '#features/managers/scope'
import type { ExpenseRecord } from '#models/expense'

/**
 * Quatre routes servies au propriétaire manquaient sous le préfixe `gerant` :
 * le résumé des dépenses, la clôture et la prolongation d'un séjour, et
 * l'historique d'un client. Les ouvrir ne pose pas un problème de routage mais
 * de **cloisonnement** : chacune traverse une jointure où le cadrage sur
 * `owner_id` laisse passer tout le parc du propriétaire, puisqu'un gérant agit
 * précisément pour son compte.
 *
 * Aucun de ces tests ne joint Firebase : les accès au modèle et au dépôt sont
 * remplacés sur l'objet modèle ou sur le prototype.
 */

/** Périmètre d'un gérant à qui deux logements sont confiés. */
const SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: ['in-scope-1', 'in-scope-2'],
}

/** Gérant fraîchement créé : une affectation vide n'ouvre rien. */
const EMPTY_SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'gerant-1',
  propertyIds: [],
}

const OWNER_SCOPE: ActorScope = {
  ownerId: 'owner-1',
  actorId: 'owner-1',
  propertyIds: null,
}

function expenseRecord(id: string, propertyId: string | null, amount: number): ExpenseRecord {
  return {
    _id: id,
    owner_id: 'owner-1',
    property_id: propertyId,
    residence_id: propertyId ? null : 'res-1',
    category: 'cleaning',
    amount,
    spent_at: new Date('2026-10-10T00:00:00Z'),
    note: null,
    created_at: new Date('2026-10-10T00:00:00Z'),
    updated_at: new Date('2026-10-10T00:00:00Z'),
  } as unknown as ExpenseRecord
}

test.group('GET /gerant/expenses/summary : le total suit le périmètre', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /**
   * Remplace `Expense.summary` par le calcul réel appliqué à un jeu figé.
   *
   * Le filtrage Firestore n'est pas rejouable hors Firebase ; `matchesInMemory`
   * l'est, et c'est lui la barrière de dernier recours — celle qui doit tenir
   * quand le périmètre est vide ou dépasse les 30 valeurs de l'opérateur `in`.
   * Ce substitut la réapplique donc telle quelle : un `scope_property_ids` que
   * le dépôt oublierait de transmettre se lirait ici comme une absence de
   * restriction, exactement comme en production.
   */
  function withExpenses(docs: ExpenseRecord[]) {
    const original = Expense.summary
    Expense.summary = async (filters) => {
      const kept = docs.filter((doc) => matchesInMemory(doc, filters))
      const buckets = new Map<string, { amount: number; count: number }>()
      let total = 0

      for (const doc of kept) {
        total += doc.amount
        const bucket = buckets.get(doc.category) ?? { amount: 0, count: 0 }
        bucket.amount += doc.amount
        bucket.count += 1
        buckets.set(doc.category, bucket)
      }

      return {
        total,
        count: kept.length,
        by_category: [...buckets.entries()].map(([category, bucket]) => ({
          category: category as ExpenseRecord['category'],
          ...bucket,
        })),
      }
    }

    restore.push(() => {
      Expense.summary = original
    })
  }

  const PARC = [
    expenseRecord('e1', 'in-scope-1', 5000),
    expenseRecord('e2', 'in-scope-2', 7000),
    expenseRecord('e3', 'out-1', 100000),
    expenseRecord('e4', 'out-2', 200000),
    // Charge commune de résidence : elle couvre aussi les logements non
    // confiés, et n'entre donc dans aucun périmètre restreint.
    expenseRecord('e5', null, 50000),
  ]

  test('le gérant ne totalise que ses logements', async ({ assert }) => {
    withExpenses(PARC)

    const summary = await new ExpenseRepository().summary({
      owner_id: 'owner-1',
      scope_property_ids: SCOPE.propertyIds,
    })

    assert.equal(summary.total, 12000)
    assert.equal(summary.count, 2)
    // Le chiffre du propriétaire, 362 000 F, ne doit affleurer nulle part.
    assert.notEqual(summary.total, 362000)
  })

  test('un gérant sans affectation ne totalise rien', async ({ assert }) => {
    withExpenses(PARC)

    const summary = await new ExpenseRepository().summary({
      owner_id: 'owner-1',
      scope_property_ids: EMPTY_SCOPE.propertyIds,
    })

    // Le piège central : un périmètre vide n'est pas une absence de périmètre.
    // Les confondre donnerait tout le compte à un gérant fraîchement créé.
    assert.equal(summary.total, 0)
    assert.equal(summary.count, 0)
    assert.lengthOf(summary.by_category, 0)
  })

  test('au-delà de 30 logements, le filtrage mémoire prend le relais', async ({ assert }) => {
    // Firestore refuse un `in` de plus de 30 valeurs : la requête tombe alors
    // au seul `owner_id`, et `matchesInMemory` reste la seule barrière.
    const perimetre = Array.from({ length: FIRESTORE_IN_LIMIT + 1 }, (_, i) => `large-${i}`)
    const docs = [
      ...perimetre.map((id, i) => expenseRecord(`in-${i}`, id, 1000)),
      expenseRecord('out', 'out-1', 999999),
    ]

    withExpenses(docs)

    const summary = await new ExpenseRepository().summary({
      owner_id: 'owner-1',
      scope_property_ids: perimetre,
    })

    assert.equal(summary.count, FIRESTORE_IN_LIMIT + 1)
    assert.equal(summary.total, (FIRESTORE_IN_LIMIT + 1) * 1000)
  })

  test('les parts par catégorie portent sur le total du périmètre', async ({ assert }) => {
    withExpenses(PARC)

    const summary = await new ExpenseRepository().summary({
      owner_id: 'owner-1',
      scope_property_ids: SCOPE.propertyIds,
    })

    // Les parts doivent boucler à 100 % du total affiché : rapportées au total
    // du propriétaire, elles vaudraient 1 % et 2 % et laisseraient deviner un
    // ailleurs.
    assert.equal(
      summary.by_category.reduce((sum, bucket) => sum + bucket.share_percent, 0),
      100
    )
  })

  test('le propriétaire conserve son relevé entier', async ({ assert }) => {
    withExpenses(PARC)

    const summary = await new ExpenseRepository().summary({
      owner_id: 'owner-1',
      scope_property_ids: OWNER_SCOPE.propertyIds,
    })

    // Charge commune comprise : elle est à lui.
    assert.equal(summary.total, 362000)
    assert.equal(summary.count, 5)
  })
})

test.group('GET /gerant/clients/:id/bookings : historique et cumuls cloisonnés', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  function bookingRecord(id: string, propertyId: string, amount: number) {
    return {
      _id: id,
      owner_id: 'owner-1',
      client_id: 'cl-1',
      property_id: propertyId,
      status: 'completed',
      total_amount: amount,
      received_amount: amount,
      start_date: new Date('2026-09-01T12:00:00Z'),
      end_date: new Date('2026-09-03T12:00:00Z'),
      check_in_at: new Date('2026-09-01T12:00:00Z'),
      days_count: 2,
      created_at: new Date('2026-09-01T12:00:00Z'),
      updated_at: new Date('2026-09-01T12:00:00Z'),
    }
  }

  const SEJOURS = [
    bookingRecord('b1', 'in-scope-1', 40000),
    bookingRecord('b2', 'in-scope-2', 20000),
    bookingRecord('b3', 'out-1', 300000),
    bookingRecord('b4', 'out-2', 120000),
  ]

  /**
   * Rejoue `Booking.findByClient` sur un jeu figé, périmètre compris.
   *
   * C'est cette méthode qui porte le cloisonnement de l'historique : elle lit
   * par `owner_id` et `client_id`, puis retient le périmètre en mémoire. Le
   * substitut reprend le même `filterByScope` plutôt que de le réécrire.
   */
  function withBookings(docs: ReturnType<typeof bookingRecord>[]) {
    const original = Booking.findByClient
    Booking.findByClient = (async (_ownerId, _clientId, scopePropertyIds) => {
      if (scopePropertyIds === null || scopePropertyIds === undefined) return docs
      return docs.filter((doc) => scopePropertyIds.includes(doc.property_id))
    }) as typeof Booking.findByClient

    restore.push(() => {
      Booking.findByClient = original
    })
  }

  /** La fiche existe dans le carnet du propriétaire. */
  function withClient() {
    const original = ClientRepository.prototype.findById
    ClientRepository.prototype.findById = async () =>
      ({ _id: 'cl-1', owner_id: 'owner-1', full_name: 'Awa Traoré' }) as never

    restore.push(() => {
      ClientRepository.prototype.findById = original
    })
  }

  /** Aucun logement n'est résolu : l'historique doit tenir sans eux. */
  function withoutProperties() {
    const original = Property.findById
    Property.findById = (async () => null) as typeof Property.findById

    restore.push(() => {
      Property.findById = original
    })
  }

  test('les séjours hors périmètre n’apparaissent pas', async ({ assert }) => {
    withClient()
    withBookings(SEJOURS)
    withoutProperties()

    const result = await new ListClientBookingsUseCase().execute(
      'cl-1',
      'owner-1',
      SCOPE.propertyIds
    )

    assert.lengthOf(result.data, 2)
    assert.deepEqual(
      result.data.map((booking) => booking.id),
      ['b1', 'b2']
    )
  })

  test('les cumuls ne comptent que les séjours rendus', async ({ assert }) => {
    withClient()
    withBookings(SEJOURS)
    withoutProperties()

    const result = await new ListClientBookingsUseCase().execute(
      'cl-1',
      'owner-1',
      SCOPE.propertyIds
    )

    // Le point décisif : un total portant sur l'historique complet — 4 séjours,
    // 480 000 F — contredirait la liste de 2 lignes affichée juste en dessous,
    // et le chiffre manquant dirait au gérant ce qu'il ne doit pas savoir.
    assert.equal(result.stats.total_stays, 2)
    assert.equal(result.stats.total_paid, 60000)
    assert.notEqual(result.stats.total_paid, 480000)
  })

  test('un gérant sans affectation ne voit aucun séjour', async ({ assert }) => {
    withClient()
    withBookings(SEJOURS)
    withoutProperties()

    const result = await new ListClientBookingsUseCase().execute(
      'cl-1',
      'owner-1',
      EMPTY_SCOPE.propertyIds
    )

    assert.lengthOf(result.data, 0)
    assert.equal(result.stats.total_stays, 0)
    assert.equal(result.stats.total_paid, 0)
  })

  test('au-delà de 30 logements, l’historique reste cloisonné', async ({ assert }) => {
    const perimetre = Array.from({ length: FIRESTORE_IN_LIMIT + 1 }, (_, i) => `large-${i}`)
    const docs = [
      ...perimetre.map((id, i) => bookingRecord(`in-${i}`, id, 1000)),
      bookingRecord('out', 'out-1', 999999),
    ]

    withClient()
    withBookings(docs)
    withoutProperties()

    const result = await new ListClientBookingsUseCase().execute('cl-1', 'owner-1', perimetre)

    assert.lengthOf(result.data, FIRESTORE_IN_LIMIT + 1)
    assert.equal(result.stats.total_paid, (FIRESTORE_IN_LIMIT + 1) * 1000)
  })

  test('le propriétaire garde l’historique complet', async ({ assert }) => {
    withClient()
    withBookings(SEJOURS)
    withoutProperties()

    const result = await new ListClientBookingsUseCase().execute('cl-1', 'owner-1', null)

    assert.lengthOf(result.data, 4)
    assert.equal(result.stats.total_stays, 4)
    assert.equal(result.stats.total_paid, 480000)
  })
})

test.group('check-out et extend : le périmètre est vérifié avant toute écriture', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  function bookingDoc(propertyId: string) {
    // Dates passées : la clôture refuse un séjour pas encore commencé, et une
    // entrée future ferait dépendre ces tests de périmètre du jour où ils
    // tournent.
    return {
      _id: 'bk-1',
      owner_id: 'owner-1',
      client_id: 'cl-1',
      property_id: propertyId,
      status: 'in_progress',
      stay_type: 'full_day',
      total_amount: 40000,
      received_amount: 40000,
      start_date: new Date('2026-08-01T12:00:00Z'),
      end_date: new Date('2026-08-03T12:00:00Z'),
      check_in_at: new Date('2026-08-01T12:00:00Z'),
      check_out_at: new Date('2026-08-03T12:00:00Z'),
      days_count: 2,
      created_at: new Date('2026-08-01T12:00:00Z'),
      updated_at: new Date('2026-08-01T12:00:00Z'),
    }
  }

  function withBooking(propertyId: string) {
    const original = Booking.findById
    Booking.findById = (async () => bookingDoc(propertyId)) as unknown as typeof Booking.findById

    restore.push(() => {
      Booking.findById = original
    })
  }

  /** Compte les écritures pour prouver qu'aucune n'a lieu hors périmètre. */
  function countWrites() {
    const counter = { updates: 0, extensions: 0 }

    const originalUpdate = Booking.findOneAndUpdate
    Booking.findOneAndUpdate = (async (_id: string, patch: Record<string, unknown>) => {
      counter.updates += 1
      return { ...bookingDoc('in-scope-1'), ...patch }
    }) as unknown as typeof Booking.findOneAndUpdate

    const originalExtend = Booking.extendBooking
    Booking.extendBooking = (async (_id: string, patch: Record<string, unknown>) => {
      counter.extensions += 1
      return { ...bookingDoc('in-scope-1'), ...patch }
    }) as unknown as typeof Booking.extendBooking

    restore.push(() => {
      Booking.findOneAndUpdate = originalUpdate
      Booking.extendBooking = originalExtend
    })

    return counter
  }

  /**
   * Rejoue la garde du contrôleur : lecture cadrée sur `owner_id`, puis
   * vérification du périmètre sur le logement de la réservation lue.
   *
   * Le `owner_id` seul ne suffit pas — toutes les réservations du propriétaire
   * le passent, y compris celles des logements non confiés —, et c'est
   * précisément l'enchaînement que ces tests verrouillent.
   */
  async function findInScope(scope: ActorScope) {
    const booking = await new FindOwnerBookingUseCase().execute('bk-1', scope.ownerId)
    assertWithinScope(scope, booking.property_id)

    return booking
  }

  test('check-out sur une réservation hors périmètre rend 403 out_of_scope', async ({ assert }) => {
    withBooking('out-1')
    const writes = countWrites()

    try {
      await findInScope(SCOPE)
      await new CheckOutBookingUseCase().execute('bk-1', SCOPE.ownerId)
      assert.fail('la clôture aurait dû être refusée')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'out_of_scope')
      assert.equal((error as DomainError).status, 403)
    }

    // Rien n'a été écrit : la garde précède la clôture, elle ne la répare pas.
    assert.equal(writes.updates, 0)
  })

  test('extend sur une réservation hors périmètre rend 403 out_of_scope', async ({ assert }) => {
    withBooking('out-1')
    const writes = countWrites()

    try {
      await findInScope(SCOPE)
      await new ExtendOwnerBookingUseCase().execute('bk-1', SCOPE.ownerId, {
        check_out_at: new Date('2026-10-06T12:00:00Z'),
      })
      assert.fail('la prolongation aurait dû être refusée')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'out_of_scope')
      assert.equal((error as DomainError).status, 403)
    }

    assert.equal(writes.extensions, 0)
  })

  test('un gérant sans affectation est refusé sur son propre parc', async ({ assert }) => {
    // Même sur un logement qui serait « le sien » : une affectation vide ne
    // donne accès à rien, et surtout pas à tout.
    withBooking('in-scope-1')
    const writes = countWrites()

    try {
      await findInScope(EMPTY_SCOPE)
      assert.fail('un périmètre vide aurait dû refuser')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'out_of_scope')
    }

    assert.equal(writes.updates, 0)
    assert.equal(writes.extensions, 0)
  })

  test('check-out dans le périmètre clôture le séjour', async ({ assert }) => {
    withBooking('in-scope-1')
    const writes = countWrites()

    await findInScope(SCOPE)
    const booking = await new CheckOutBookingUseCase().execute('bk-1', SCOPE.ownerId)

    assert.equal(booking.status, 'completed')
    assert.equal(writes.updates, 1)
  })

  test('au-delà de 30 logements, la garde tient encore', async ({ assert }) => {
    const perimetre = Array.from({ length: FIRESTORE_IN_LIMIT + 1 }, (_, i) => `large-${i}`)
    const scope: ActorScope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: perimetre }

    // `assertWithinScope` ne passe jamais par l'opérateur `in` : elle teste
    // l'appartenance en mémoire, et la bordure des 30 ne la concerne pas. Le
    // vérifier des deux côtés interdit d'y glisser un jour un raccourci.
    withBooking('large-0')
    await findInScope(scope)

    withBooking('out-1')
    await assert.rejects(() => findInScope(scope))
  })

  test('le propriétaire n’est pas gêné par la garde', async ({ assert }) => {
    withBooking('out-1')
    const writes = countWrites()

    await findInScope(OWNER_SCOPE)
    await new CheckOutBookingUseCase().execute('bk-1', OWNER_SCOPE.ownerId)

    assert.equal(writes.updates, 1)
  })
})

test.group('extend : un conflit de période reste un arbitrage, pas une panne', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  test('un conflit remonte en 409 booking_period_conflict', async ({ assert }) => {
    const originalFind = Booking.findById
    Booking.findById = (async () => ({
      _id: 'bk-1',
      owner_id: 'owner-1',
      property_id: 'in-scope-1',
      status: 'in_progress',
      stay_type: 'full_day',
      start_date: new Date('2026-10-01T12:00:00Z'),
      end_date: new Date('2026-10-03T12:00:00Z'),
      check_in_at: new Date('2026-10-01T12:00:00Z'),
      check_out_at: new Date('2026-10-03T12:00:00Z'),
    })) as unknown as typeof Booking.findById

    const originalProperty = Property.findById
    Property.findById = (async () => ({
      _id: 'in-scope-1',
      owner_id: 'owner-1',
      pricing: { daily_price: 20000 },
    })) as unknown as typeof Property.findById

    const originalExtend = Booking.extendBooking
    Booking.extendBooking = (async () => {
      throw new Error('booking_period_conflict')
    }) as unknown as typeof Booking.extendBooking

    restore.push(() => {
      Booking.findById = originalFind
      Property.findById = originalProperty
      Booking.extendBooking = originalExtend
    })

    try {
      await new ExtendOwnerBookingUseCase().execute('bk-1', 'owner-1', {
        check_out_at: new Date('2026-10-06T12:00:00Z'),
      })
      assert.fail('le conflit aurait dû être signalé')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      // Le mobile distingue ce 409 du 403 `out_of_scope` : le premier se
      // rejoue après arbitrage, le second est définitif et sort de la file.
      assert.equal((error as DomainError).code, 'booking_period_conflict')
      assert.equal((error as DomainError).status, 409)
    }
  })
})
