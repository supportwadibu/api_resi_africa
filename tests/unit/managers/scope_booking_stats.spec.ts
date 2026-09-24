import { test } from '@japa/runner'

import GerantBookingController from '#controllers/gerant/booking_controller'
import ProprioBookingController from '#controllers/proprio/booking_controller'
import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import Booking from '#models/booking'
import Property from '#models/property'

import BookingRepository from '../../../app/features/bookings/repositories/booking_repository.ts'
import { GetBookingStatsUseCase } from '../../../app/features/bookings/use_cases/index.ts'

import type { ActorScope } from '#features/managers/scope'
import type { BookingRecord } from '#models/booking'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Les compteurs de l'onglet Réservations — taux d'occupation, séjours à venir
 * et en cours, revenu du mois — étaient servis par une seule route,
 * `GET /proprio/bookings/stats`. Le mobile y pointait pour les deux rôles, si
 * bien que le gérant recevait un 403 et que ses compteurs disparaissaient.
 *
 * Ouvrir la route ne suffisait pas : `BookingRepository.stats` lisait les deux
 * sources du calcul sur le seul `owner_id`. Ce qui se joue ici est le
 * **dénominateur du taux d'occupation**. Numérateur et dénominateur viennent de
 * deux lectures distinctes — les réservations d'un côté, le parc de l'autre —,
 * et cloisonner la première sans la seconde rapporterait les nuits de six
 * logements aux jours-bien de dix : un taux écrasé de 40 %, faux, et affiché
 * comme un fait.
 */

test.group('stats du gérant : le périmètre descend jusqu’au use case', (group) => {
  let received: unknown[] = []
  const restore: Array<() => void> = []

  group.each.setup(() => {
    received = []
  })

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /**
   * Remplace `execute` sur le prototype et retient ses arguments.
   *
   * Le contrôleur instancie son use case en dur : intercepter le prototype est
   * le seul point de prise, et cela coupe par la même occasion tout accès
   * Firebase.
   */
  function capture(result: unknown = {}) {
    const original = GetBookingStatsUseCase.prototype.execute

    GetBookingStatsUseCase.prototype.execute = async (...args: unknown[]) => {
      received = args
      return result as never
    }

    restore.push(() => {
      GetBookingStatsUseCase.prototype.execute = original
    })
  }

  test('GET /gerant/bookings/stats : les compteurs portent sur le périmètre', async ({
    assert,
  }) => {
    capture(statsResult())

    const response = await new GerantBookingController().stats(ctx())

    const [ownerId, scopePropertyIds] = received as [string, string[] | null]

    assert.equal(ownerId, 'owner-1')
    // `null` ici rendrait les compteurs de tout le parc du propriétaire, taux
    // d'occupation compris.
    assert.deepEqual(scopePropertyIds, ['unit-1', 'unit-2'])
    assert.deepEqual(response, { data: statsResult() })
  })

  test('un gérant sans affectation transmet une liste vide, jamais `null`', async ({ assert }) => {
    capture(statsResult())

    const empty = ctx()
    empty.scope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: [] }

    await new GerantBookingController().stats(empty)

    const [, scopePropertyIds] = received as [string, string[] | null]

    // L'invariant central : `[]` n'est pas `null`. Les confondre donnerait tout
    // le compte du propriétaire à un gérant fraîchement créé.
    assert.deepEqual(scopePropertyIds, [])
    assert.isNotNull(scopePropertyIds)
  })

  test('un périmètre de 31 logements descend entier', async ({ assert }) => {
    capture(statsResult())

    const wide = ctx()
    const ids = Array.from({ length: FIRESTORE_IN_LIMIT + 1 }, (_, i) => `unit-${i}`)
    wide.scope = { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: ids }

    await new GerantBookingController().stats(wide)

    const [, scopePropertyIds] = received as [string, string[] | null]

    // Le contrôleur ne tronque rien : c'est le modèle qui bascule en filtrage
    // mémoire au-delà de la limite Firestore. Une troncature ici rendrait un
    // périmètre plus étroit que l'affectation.
    assert.lengthOf(scopePropertyIds!, FIRESTORE_IN_LIMIT + 1)
    assert.deepEqual(scopePropertyIds, ids)
  })

  test('le chemin du propriétaire reste sans périmètre', async ({ assert }) => {
    capture(statsResult())

    await new ProprioBookingController().stats(proprioCtx())

    const [ownerId, scopePropertyIds] = received as [string, string[] | null]

    assert.equal(ownerId, 'owner-1')
    // Le propriétaire voit tout son parc : un tableau glissé ici restreindrait
    // ses propres chiffres.
    assert.isUndefined(scopePropertyIds)
  })
})

test.group('stats : les deux sources du calcul sont cloisonnées', (group) => {
  const restore: Array<() => void> = []

  group.each.teardown(() => {
    while (restore.length) restore.pop()!()
  })

  /** Retient les périmètres reçus par chacune des deux lectures Firestore. */
  function captureReads() {
    const seen: { revenue?: unknown; parc?: unknown } = {}

    const originalRevenue = Booking.findForRevenue
    Booking.findForRevenue = (async (
      _ownerId: string,
      _range: unknown,
      readScope: { property_ids?: string[] | null } = {}
    ) => {
      seen.revenue = readScope.property_ids
      return []
    }) as typeof Booking.findForRevenue

    const originalStats = Property.statsByOwner
    Property.statsByOwner = (async (_ownerId: string, scopePropertyIds?: string[] | null) => {
      seen.parc = scopePropertyIds
      return { total: 0, published: 0, rented: 0, draft: 0, total_views: 0 }
    }) as typeof Property.statsByOwner

    restore.push(() => {
      Booking.findForRevenue = originalRevenue
      Property.statsByOwner = originalStats
    })

    return seen
  }

  test('le parc reçoit le même périmètre que les réservations', async ({ assert }) => {
    const seen = captureReads()

    await new BookingRepository().stats('owner-1', new Date('2026-03-15T00:00:00Z'), [
      'unit-1',
      'unit-2',
    ])

    assert.deepEqual(seen.revenue, ['unit-1', 'unit-2'])
    // Le cœur du défaut : c'est cette lecture qui fournit le dénominateur du
    // taux d'occupation. Non cloisonnée, elle compterait les dix logements du
    // propriétaire sous les nuits des deux logements confiés.
    assert.deepEqual(seen.parc, ['unit-1', 'unit-2'])
  })

  test('sans périmètre, les deux lectures restent celles du propriétaire', async ({ assert }) => {
    const seen = captureReads()

    await new BookingRepository().stats('owner-1', new Date('2026-03-15T00:00:00Z'))

    assert.isNull(seen.revenue)
    assert.isNull(seen.parc)
  })

  test('six logements confiés sur dix : le taux porte sur les six', async ({ assert }) => {
    const now = new Date('2026-03-31T00:00:00Z')

    // Un seul séjour, sur un logement **du périmètre** : le numérateur est
    // donc identique dans les deux appels, et seul le dénominateur les
    // sépare. C'est la seule façon d'isoler ce que ce test regarde.
    const originalRevenue = Booking.findForRevenue
    Booking.findForRevenue = (async (
      _ownerId: string,
      _range: unknown,
      readScope: { property_ids?: string[] | null } = {}
    ) => {
      const all = [stayBooking('unit-1', '2026-03-01', '2026-03-16')]

      const ids = readScope.property_ids
      return ids === null || ids === undefined
        ? all
        : all.filter((doc) => ids.includes(doc.property_id))
    }) as typeof Booking.findForRevenue

    const originalStats = Property.statsByOwner
    Property.statsByOwner = (async (_ownerId: string, scopePropertyIds?: string[] | null) => {
      // Le parc du propriétaire compte dix logements publiés ; six sont
      // confiés.
      const published = scopePropertyIds ? scopePropertyIds.length : 10
      return { total: published, published, rented: 0, draft: 0, total_views: 0 }
    }) as typeof Property.statsByOwner

    restore.push(() => {
      Booking.findForRevenue = originalRevenue
      Property.statsByOwner = originalStats
    })

    const scoped = await new BookingRepository().stats('owner-1', now, [
      'unit-1',
      'unit-2',
      'unit-3',
      'unit-4',
      'unit-5',
      'unit-6',
    ])

    const full = await new BookingRepository().stats('owner-1', now)

    // Même numérateur de nuits, dénominateurs différents. Le rapport des deux
    // taux vaut exactement 10/6 : le taux du gérant est celui de six logements,
    // celui du propriétaire celui de dix. Sans le cloisonnement du
    // dénominateur, le gérant lisait le second — écrasé par quatre logements
    // dont il ignore jusqu'à l'existence.
    assert.isAbove(scoped.taux_occupation, 0)
    assert.closeTo(scoped.taux_occupation, full.taux_occupation * (10 / 6), 1e-9)
  })

  test('un gérant sans logement n’obtient rien du parc du propriétaire', async ({ assert }) => {
    const originalRevenue = Booking.findForRevenue
    Booking.findForRevenue = (async (
      _ownerId: string,
      _range: unknown,
      readScope: { property_ids?: string[] | null } = {}
    ) => {
      const all = [stayBooking('unit-9', '2026-03-01', '2026-03-31')]
      const ids = readScope.property_ids
      return ids === null || ids === undefined
        ? all
        : all.filter((doc) => ids.includes(doc.property_id))
    }) as typeof Booking.findForRevenue

    const originalStats = Property.statsByOwner
    Property.statsByOwner = (async (_ownerId: string, scopePropertyIds?: string[] | null) => {
      // Ce que rend réellement `statsByOwner` sur périmètre vide : un parc nul,
      // sans même lire les documents.
      const published = Array.isArray(scopePropertyIds) ? scopePropertyIds.length : 10
      return { total: published, published, rented: 0, draft: 0, total_views: 0 }
    }) as typeof Property.statsByOwner

    restore.push(() => {
      Booking.findForRevenue = originalRevenue
      Property.statsByOwner = originalStats
    })

    const stats = await new BookingRepository().stats(
      'owner-1',
      new Date('2026-03-31T00:00:00Z'),
      []
    )

    assert.equal(stats.revenue.current_month, 0)
    assert.equal(stats.upcoming, 0)
    assert.equal(stats.in_progress, 0)
    // Zéro logement, zéro jour-bien : le taux ne peut valoir que 0. Un
    // dénominateur nul lu comme « pas de restriction » l'aurait fait porter sur
    // les dix logements du propriétaire.
    assert.equal(stats.taux_occupation, 0)
  })
})

/** Réservation confirmée réduite à ce que `booking_stats` lit. */
function stayBooking(propertyId: string, from: string, to: string): BookingRecord {
  return {
    _id: `bk-${propertyId}-${from}`,
    owner_id: 'owner-1',
    property_id: propertyId,
    status: 'confirmed',
    stay_type: 'full_day',
    start_date: new Date(`${from}T12:00:00Z`),
    end_date: new Date(`${to}T12:00:00Z`),
    total_amount: 30000,
  } as unknown as BookingRecord
}

/** Réponse de use case réduite à la forme de `BookingStatsDto`. */
function statsResult() {
  return {
    taux_occupation: 0.5,
    upcoming: 2,
    in_progress: 1,
    revenue: { current_month: 120000, previous_month: 80000, growth_percent: 50 },
  }
}

/** Périmètre d'un gérant à qui deux logements sont confiés. */
function scope(): ActorScope {
  return { ownerId: 'owner-1', actorId: 'gerant-1', propertyIds: ['unit-1', 'unit-2'] }
}

/** Contexte HTTP réduit à ce que lit le contrôleur gérant. */
function ctx(): HttpContext {
  return {
    params: {},
    scope: scope(),
    request: { qs: () => ({}), validateUsing: async () => ({}) },
    response: { ok: (body: unknown) => body },
  } as unknown as HttpContext
}

/** Contexte HTTP du propriétaire : `authUser`, et aucun `scope`. */
function proprioCtx(): HttpContext {
  return {
    params: {},
    authUser: { id: 'owner-1' },
    request: { qs: () => ({}), validateUsing: async () => ({}) },
    response: {
      ok: (body: unknown) => body,
      unauthorized: (body: unknown) => body,
    },
  } as unknown as HttpContext
}
