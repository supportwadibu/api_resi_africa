import { test } from '@japa/runner'

import {
  assertWithinScope,
  buildScopedWrite,
  canUseInFilter,
  isWithinScope,
  scopeFilterIds,
  type ActorScope,
} from '#features/managers/scope'
import { DomainError } from '#utils/domain_error'

const OWNER = 'owner-1'

function ownerScope(): ActorScope {
  return { ownerId: OWNER, actorId: OWNER, propertyIds: null }
}

function managerScope(ids: string[]): ActorScope {
  return { ownerId: OWNER, actorId: 'gerant-1', propertyIds: ids }
}

test.group('isWithinScope', () => {
  test('le propriétaire accède à tout logement', ({ assert }) => {
    assert.isTrue(isWithinScope(ownerScope(), 'studio-9'))
  })

  test('un gérant accède à un logement de son périmètre', ({ assert }) => {
    assert.isTrue(isWithinScope(managerScope(['studio-1']), 'studio-1'))
  })

  test('un gérant n’accède pas à un logement hors périmètre', ({ assert }) => {
    assert.isFalse(isWithinScope(managerScope(['studio-1']), 'studio-2'))
  })

  test('un périmètre vide n’ouvre rien', ({ assert }) => {
    assert.isFalse(isWithinScope(managerScope([]), 'studio-1'))
  })

  test('le propriétaire accède à une ressource sans logement', ({ assert }) => {
    assert.isTrue(isWithinScope(ownerScope(), null))
  })

  test('un gérant n’accède pas à une ressource sans logement', ({ assert }) => {
    // Une dépense de charge commune porte `residence_id` et non `property_id` :
    // elle relève du propriétaire, pas d'un gérant au périmètre partiel.
    assert.isFalse(isWithinScope(managerScope(['studio-1']), null))
  })
})

test.group('canUseInFilter', () => {
  test('le propriétaire ne filtre pas par liste', ({ assert }) => {
    assert.isFalse(canUseInFilter(ownerScope()))
  })

  test('29 logements passent par le filtre Firestore', ({ assert }) => {
    const ids = Array.from({ length: 29 }, (_, i) => `p-${i}`)
    assert.isTrue(canUseInFilter(managerScope(ids)))
  })

  test('30 logements passent encore par le filtre Firestore', ({ assert }) => {
    const ids = Array.from({ length: 30 }, (_, i) => `p-${i}`)
    assert.isTrue(canUseInFilter(managerScope(ids)))
  })

  test('31 logements basculent en filtrage mémoire', ({ assert }) => {
    const ids = Array.from({ length: 31 }, (_, i) => `p-${i}`)
    assert.isFalse(canUseInFilter(managerScope(ids)))
  })

  test('un périmètre vide ne passe pas par le filtre Firestore', ({ assert }) => {
    // `where(..., 'in', [])` lève côté Firestore : le cas se traite en amont.
    assert.isFalse(canUseInFilter(managerScope([])))
  })
})

test.group('scopeFilterIds', () => {
  test('rend null pour le propriétaire', ({ assert }) => {
    assert.isNull(scopeFilterIds(ownerScope()))
  })

  test('rend la liste pour un gérant sous la limite', ({ assert }) => {
    assert.deepEqual(scopeFilterIds(managerScope(['a', 'b'])), ['a', 'b'])
  })

  test('rend null au-delà de la limite, le filtrage passant en mémoire', ({ assert }) => {
    const ids = Array.from({ length: 31 }, (_, i) => `p-${i}`)
    assert.isNull(scopeFilterIds(managerScope(ids)))
  })
})

test.group('assertWithinScope', () => {
  test('laisse passer un logement du périmètre', ({ assert }) => {
    assert.doesNotThrows(() => assertWithinScope(managerScope(['studio-1']), 'studio-1'))
  })

  test('lève out_of_scope en 403 hors périmètre', ({ assert }) => {
    assert.throws(() => assertWithinScope(managerScope(['studio-1']), 'studio-2'))

    try {
      assertWithinScope(managerScope(['studio-1']), 'studio-2')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'out_of_scope')
      assert.equal((error as DomainError).status, 403)
    }
  })
})

test.group('buildScopedWrite', () => {
  test('une saisie de gérant appartient au propriétaire', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, managerScope(['studio-1']))
    assert.equal(payload.owner_id, OWNER)
  })

  test('une saisie de gérant porte son auteur réel', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, managerScope(['studio-1']))
    assert.equal(payload.created_by, 'gerant-1')
  })

  test('une saisie du propriétaire ne porte pas d’auteur distinct', ({ assert }) => {
    const payload = buildScopedWrite({ property_id: 'studio-1' }, ownerScope())
    assert.equal(payload.owner_id, OWNER)
    assert.isNull(payload.created_by)
  })

  test('une saisie hors périmètre est refusée', ({ assert }) => {
    assert.throws(() => buildScopedWrite({ property_id: 'studio-9' }, managerScope(['studio-1'])))
  })
})
