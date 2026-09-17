import { test } from '@japa/runner'

import { resolveActorScope } from '#features/managers/use_cases/resolve_actor_scope.use_case'
import { DomainError } from '#utils/domain_error'

import type { ManagerAssignmentRecord } from '#models/manager_assignment'

function assignment(over: Partial<ManagerAssignmentRecord> = {}): ManagerAssignmentRecord {
  return {
    _id: 'gerant-1',
    owner_id: 'owner-1',
    manager_id: 'gerant-1',
    property_ids: ['studio-1', 'studio-2'],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  }
}

test.group('resolveActorScope', () => {
  test('le propriétaire obtient un périmètre sans restriction', async ({ assert }) => {
    const scope = await resolveActorScope({ id: 'owner-1', role: 'proprio' }, async () => null)

    assert.deepEqual(scope, { ownerId: 'owner-1', actorId: 'owner-1', propertyIds: null })
  })

  test('le gérant agit pour le compte de son propriétaire', async ({ assert }) => {
    const scope = await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
      assignment()
    )

    assert.equal(scope.ownerId, 'owner-1')
    assert.equal(scope.actorId, 'gerant-1')
    assert.deepEqual(scope.propertyIds, ['studio-1', 'studio-2'])
  })

  test('un gérant sans affectation est refusé', async ({ assert }) => {
    try {
      await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () => null)
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'manager_not_assigned')
      assert.equal((error as DomainError).status, 403)
    }
  })

  test('un gérant suspendu est refusé', async ({ assert }) => {
    try {
      await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
        assignment({ is_active: false })
      )
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.equal((error as DomainError).code, 'manager_not_assigned')
    }
  })

  test('un gérant sans aucun logement obtient un périmètre vide, non un accès total', async ({
    assert,
  }) => {
    const scope = await resolveActorScope({ id: 'gerant-1', role: 'gerant' }, async () =>
      assignment({ property_ids: [] })
    )

    assert.deepEqual(scope.propertyIds, [])
    assert.isNotNull(scope.propertyIds)
  })
})
