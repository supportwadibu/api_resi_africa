import { test } from '@japa/runner'

import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import { needsInMemoryScope as bookingNeedsInMemoryScope } from '#models/booking'
import { matchesInMemory as expenseMatchesInMemory } from '#models/expense'
import {
  matchesInMemory as propertyMatchesInMemory,
  needsInMemoryScope as propertyNeedsInMemoryScope,
} from '#models/property'

import type { ExpenseRecord } from '#models/expense'
import type { PropertyRecord } from '#models/property'

/**
 * Condition d'usage du `in` dans les trois `buildQuery`, recopiée telle quelle.
 *
 * C'est le témoin du test : une divergence entre elle et `needsInMemoryScope`
 * laisserait une liste sans aucun filtrage — ni Firestore, ni mémoire.
 */
function firestoreCanFilter(ids: string[] | null | undefined): boolean {
  return Boolean(ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT)
}

/** Périmètre de `size` logements, pour éprouver les bornes de l'opérateur `in`. */
function scopeOfSize(size: number): string[] {
  return Array.from({ length: size }, (_, i) => `unit-${i}`)
}

// 0 et 31 basculent en mémoire, 1/29/30 partent chez Firestore. 30 est la
// dernière valeur acceptée par `in`, 31 la première refusée : c'est là qu'une
// confusion `>`/`>=` produirait une requête levante en production.
const BOUNDARY_SIZES = [0, 1, 29, 30, 31]

test.group('complémentarité des prédicats de périmètre', () => {
  test('booking : needsInMemoryScope est la négation exacte du filtre Firestore', ({ assert }) => {
    for (const size of BOUNDARY_SIZES) {
      const ids = scopeOfSize(size)

      assert.equal(
        bookingNeedsInMemoryScope({ scope_property_ids: ids }),
        !firestoreCanFilter(ids),
        `périmètre de ${size} logement(s) : ni Firestore ni la mémoire ne filtrerait`
      )
    }
  })

  test('property : needsInMemoryScope est la négation exacte du filtre Firestore', ({ assert }) => {
    for (const size of BOUNDARY_SIZES) {
      const ids = scopeOfSize(size)

      assert.equal(
        propertyNeedsInMemoryScope({ scope_property_ids: ids }),
        !firestoreCanFilter(ids),
        `périmètre de ${size} logement(s) : ni Firestore ni la mémoire ne filtrerait`
      )
    }
  })

  test('les bornes 30 et 31 se répartissent bien de part et d’autre', ({ assert }) => {
    // Verrouille la valeur elle-même : la porter à 31 côté `buildQuery` sans la
    // porter côté prédicat rouvrirait le compte entier.
    assert.equal(FIRESTORE_IN_LIMIT, 30)

    assert.isFalse(bookingNeedsInMemoryScope({ scope_property_ids: scopeOfSize(30) }))
    assert.isTrue(bookingNeedsInMemoryScope({ scope_property_ids: scopeOfSize(31) }))
    assert.isFalse(propertyNeedsInMemoryScope({ scope_property_ids: scopeOfSize(30) }))
    assert.isTrue(propertyNeedsInMemoryScope({ scope_property_ids: scopeOfSize(31) }))
  })

  test('un périmètre vide bascule en mémoire et n’est jamais confié à Firestore', ({ assert }) => {
    assert.isFalse(firestoreCanFilter([]))
    assert.isTrue(bookingNeedsInMemoryScope({ scope_property_ids: [] }))
    assert.isTrue(propertyNeedsInMemoryScope({ scope_property_ids: [] }))
  })
})

test.group('non-régression : absence de périmètre', () => {
  test('booking : undefined et null ne déclenchent jamais la branche mémoire', ({ assert }) => {
    assert.isFalse(bookingNeedsInMemoryScope({}))
    assert.isFalse(bookingNeedsInMemoryScope({ scope_property_ids: undefined }))
    assert.isFalse(bookingNeedsInMemoryScope({ scope_property_ids: null }))
  })

  test('property : undefined et null ne déclenchent jamais la branche mémoire', ({ assert }) => {
    assert.isFalse(propertyNeedsInMemoryScope({}))
    assert.isFalse(propertyNeedsInMemoryScope({ scope_property_ids: undefined }))
    assert.isFalse(propertyNeedsInMemoryScope({ scope_property_ids: null }))
  })

  test('property : sans périmètre, matchesInMemory ne retire aucun bien', ({ assert }) => {
    const doc = propertyRecord('studio-hors-perimetre')

    assert.isTrue(propertyMatchesInMemory(doc, {}))
    assert.isTrue(propertyMatchesInMemory(doc, { scope_property_ids: undefined }))
    assert.isTrue(propertyMatchesInMemory(doc, { scope_property_ids: null }))
  })

  test('expense : sans périmètre, la charge commune est conservée', ({ assert }) => {
    // Le propriétaire garde ses charges de résidence, sans `property_id`.
    const commune = expenseRecord('e1', null)

    assert.isTrue(expenseMatchesInMemory(commune, {}))
    assert.isTrue(expenseMatchesInMemory(commune, { scope_property_ids: null }))
  })
})

test.group('property : l’appartenance se juge sur l’identifiant du document', () => {
  test('un bien du périmètre est retenu, un bien hors périmètre est écarté', ({ assert }) => {
    const filters = { scope_property_ids: ['studio-1', 'studio-2'] }

    assert.isTrue(propertyMatchesInMemory(propertyRecord('studio-1'), filters))
    assert.isFalse(propertyMatchesInMemory(propertyRecord('studio-3'), filters))
  })

  test('le périmètre est confronté à `_id`, jamais à un champ `property_id`', ({ assert }) => {
    // Un bien n'a pas de `property_id` : c'est lui-même le logement. Le document
    // porte ici un `property_id` trompeur, qui *est* dans le périmètre alors que
    // son `_id` n'y est pas. Comparer le mauvais champ le laisserait passer et
    // livrerait au gérant un bien qui ne lui est pas confié.
    const piege = {
      ...propertyRecord('studio-hors-perimetre'),
      property_id: 'studio-1',
    } as PropertyRecord

    assert.isFalse(propertyMatchesInMemory(piege, { scope_property_ids: ['studio-1'] }))
  })

  test('un périmètre vide n’autorise aucun bien', ({ assert }) => {
    assert.isFalse(propertyMatchesInMemory(propertyRecord('studio-1'), { scope_property_ids: [] }))
  })
})

test.group('expense : périmètre appliqué en mémoire', () => {
  test('une dépense du périmètre est retenue, une autre est écartée', ({ assert }) => {
    const filters = { scope_property_ids: ['studio-1'] }

    assert.isTrue(expenseMatchesInMemory(expenseRecord('e1', 'studio-1'), filters))
    assert.isFalse(expenseMatchesInMemory(expenseRecord('e2', 'studio-2'), filters))
  })

  test('une charge commune est retirée au gérant', ({ assert }) => {
    // Sans `property_id`, elle n'appartient à aucun périmètre restreint.
    assert.isFalse(
      expenseMatchesInMemory(expenseRecord('e1', null), { scope_property_ids: ['studio-1'] })
    )
  })

  test('un périmètre vide n’autorise aucune dépense', ({ assert }) => {
    assert.isFalse(
      expenseMatchesInMemory(expenseRecord('e1', 'studio-1'), { scope_property_ids: [] })
    )
  })
})

/** Bien réduit aux champs lus par `matchesInMemory`. */
function propertyRecord(id: string): PropertyRecord {
  return {
    _id: id,
    address: { city: 'Abidjan' },
    details: { surface_area: 40, bedrooms: 2 },
    pricing: { daily_price: 15000 },
    available_from: new Date('2026-01-01'),
  } as unknown as PropertyRecord
}

/** Dépense réduite aux champs lus par `matchesInMemory`. */
function expenseRecord(id: string, propertyId: string | null): ExpenseRecord {
  return {
    _id: id,
    property_id: propertyId,
    amount: 5000,
    spent_at: new Date('2026-01-15'),
  } as unknown as ExpenseRecord
}
