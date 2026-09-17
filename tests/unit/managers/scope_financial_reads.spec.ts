import { test } from '@japa/runner'

import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import { matchesRevenueScope } from '#models/booking'
import { matchesInMemory as expenseMatchesInMemory } from '#models/expense'
import { computeStatsInMemory, intersectScope, needsInMemoryStats } from '#models/property'

import type { BookingRecord } from '#models/booking'
import type { ExpenseRecord } from '#models/expense'
import type { PropertyRecord } from '#models/property'

/**
 * Les trois lectures financières — réservations, dépenses, parc — lisaient par
 * `owner_id` seul. Un relevé de gérant construit dessus aurait porté les
 * logements des autres. Chaque partie pure du filtrage est verrouillée ici.
 */

function bookingRecord(propertyId: string | null): BookingRecord {
  return {
    _id: 'b1',
    property_id: propertyId,
    owner_id: 'owner-1',
    status: 'confirmed',
    start_date: new Date('2026-10-01T12:00:00Z'),
    end_date: new Date('2026-10-04T12:00:00Z'),
    total_amount: 30000,
  } as unknown as BookingRecord
}

function expenseRecord(propertyId: string | null): ExpenseRecord {
  return {
    _id: 'e1',
    owner_id: 'owner-1',
    property_id: propertyId,
    amount: 5000,
    spent_at: new Date('2026-10-15T00:00:00Z'),
  } as unknown as ExpenseRecord
}

function propertyRecord(id: string, status: string, views: number): PropertyRecord {
  return {
    _id: id,
    owner_id: 'owner-1',
    status,
    metadata: { views_count: views },
  } as unknown as PropertyRecord
}

test.group('Booking.findForRevenue : périmètre', () => {
  test('retient une réservation du périmètre, écarte les autres', ({ assert }) => {
    assert.isTrue(matchesRevenueScope(bookingRecord('unit-1'), ['unit-1', 'unit-2']))
    assert.isFalse(matchesRevenueScope(bookingRecord('unit-9'), ['unit-1', 'unit-2']))
  })

  test('un périmètre vide n’autorise aucune réservation', ({ assert }) => {
    assert.isFalse(matchesRevenueScope(bookingRecord('unit-1'), []))
  })

  test('sans périmètre, le propriétaire garde tout', ({ assert }) => {
    assert.isTrue(matchesRevenueScope(bookingRecord('unit-9'), null))
    assert.isTrue(matchesRevenueScope(bookingRecord('unit-9'), undefined))
  })

  test('une réservation sans logement est écartée d’un périmètre restreint', ({ assert }) => {
    // Sans `property_id`, elle ne peut être rattachée à aucun logement confié.
    assert.isFalse(matchesRevenueScope(bookingRecord(null), ['unit-1']))
  })
})

test.group('Expense.findAllForOwner : périmètre', () => {
  test('les bornes de date et le périmètre s’appliquent ensemble', ({ assert }) => {
    const filters = {
      owner_id: 'owner-1',
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-10-31T23:59:59Z'),
      scope_property_ids: ['unit-1'],
    }

    assert.isTrue(expenseMatchesInMemory(expenseRecord('unit-1'), filters))
    assert.isFalse(expenseMatchesInMemory(expenseRecord('unit-2'), filters))
    // La charge commune de résidence couvre aussi les logements non confiés.
    assert.isFalse(expenseMatchesInMemory(expenseRecord(null), filters))
  })

  test('un périmètre vide n’autorise aucune dépense', ({ assert }) => {
    assert.isFalse(
      expenseMatchesInMemory(expenseRecord('unit-1'), {
        owner_id: 'owner-1',
        scope_property_ids: [],
      })
    )
  })
})

test.group('Property.statsByOwner : périmètre', () => {
  const PARC = [
    propertyRecord('unit-1', 'published', 10),
    propertyRecord('unit-2', 'rented', 5),
    propertyRecord('unit-3', 'draft', 2),
    propertyRecord('unit-4', 'published', 100),
  ]

  test('les agrégats se recomposent à l’identique en mémoire', ({ assert }) => {
    assert.deepEqual(computeStatsInMemory(PARC), {
      total: 4,
      published: 2,
      rented: 1,
      draft: 1,
      total_views: 117,
    })
  })

  test('un parc vide ne rend que des zéros', ({ assert }) => {
    assert.deepEqual(computeStatsInMemory([]), {
      total: 0,
      published: 0,
      rented: 0,
      draft: 0,
      total_views: 0,
    })
  })

  test('un compteur de vues absent vaut zéro sur l’historique', ({ assert }) => {
    // `metadata.views_count` n'existe pas sur les biens antérieurs au compteur.
    const ancien = { _id: 'unit-5', status: 'published' } as unknown as PropertyRecord

    assert.equal(computeStatsInMemory([ancien]).total_views, 0)
  })

  test('les bornes de l’opérateur `in` décident du mode de calcul', ({ assert }) => {
    const ids = (size: number) => Array.from({ length: size }, (_, i) => `unit-${i}`)

    // Sans périmètre, les agrégats serveur restent employés : le chemin du
    // propriétaire est strictement inchangé.
    assert.isFalse(needsInMemoryStats(null))
    assert.isFalse(needsInMemoryStats(undefined))

    assert.isFalse(needsInMemoryStats(ids(1)))
    assert.isFalse(needsInMemoryStats(ids(FIRESTORE_IN_LIMIT)))
    assert.isTrue(needsInMemoryStats(ids(FIRESTORE_IN_LIMIT + 1)))
    assert.isTrue(needsInMemoryStats([]))
  })
})

test.group('Property.findIdsByResidence : périmètre', () => {
  test('ne rend que les unités à la fois dans la résidence et dans le périmètre', ({ assert }) => {
    // Une résidence de 10 logements dont 6 confiés doit s'y présenter avec 6 :
    // le dénominateur du taux d'occupation en dépend.
    const unites = Array.from({ length: 10 }, (_, i) => `unit-${i}`)
    const perimetre = ['unit-0', 'unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5']

    assert.deepEqual(intersectScope(unites, perimetre), perimetre)
  })

  test('sans périmètre, la liste des unités est rendue intacte', ({ assert }) => {
    assert.deepEqual(intersectScope(['unit-0', 'unit-1'], null), ['unit-0', 'unit-1'])
    assert.deepEqual(intersectScope(['unit-0', 'unit-1'], undefined), ['unit-0', 'unit-1'])
  })

  test('un périmètre vide ne rend aucune unité', ({ assert }) => {
    assert.deepEqual(intersectScope(['unit-0', 'unit-1'], []), [])
  })

  test('un périmètre portant sur une autre résidence ne rend rien', ({ assert }) => {
    assert.deepEqual(intersectScope(['unit-0', 'unit-1'], ['autre-1']), [])
  })
})
