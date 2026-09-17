import { test } from '@japa/runner'

import { loadOwnedAssignment } from '#features/managers/use_cases/get_manager.use_case'
import { DomainError } from '#utils/domain_error'

import type ManagerRepository from '#features/managers/repositories/manager_repository'
import type { ManagerAssignmentRecord } from '#models/manager_assignment'

/**
 * Double de repository : `loadOwnedAssignment` reçoit son dépôt en argument, si
 * bien que la garde s'éprouve sans contacter Firebase.
 */
function repoReturning(assignment: ManagerAssignmentRecord | null): ManagerRepository {
  return {
    async findAssignment() {
      return assignment
    },
  } as unknown as ManagerRepository
}

function assignmentOf(ownerId: string): ManagerAssignmentRecord {
  return {
    _id: 'manager-1',
    owner_id: ownerId,
    manager_id: 'manager-1',
    property_ids: ['studio-1'],
    is_active: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
  }
}

test.group('loadOwnedAssignment', () => {
  test('rend une affectation appartenant au propriétaire qui interroge', async ({ assert }) => {
    const repo = repoReturning(assignmentOf('owner-1'))

    const assignment = await loadOwnedAssignment(repo, 'manager-1', 'owner-1')

    assert.equal(assignment.owner_id, 'owner-1')
    assert.equal(assignment._id, 'manager-1')
  })

  test("lève manager_not_found en 404 pour l'affectation d'un autre propriétaire", async ({
    assert,
  }) => {
    // Le cas qui compte : la garde d'isolation entre propriétaires. Un gérant
    // affecté à `owner-2` ne doit jamais être atteignable par `owner-1`.
    const repo = repoReturning(assignmentOf('owner-2'))

    try {
      await loadOwnedAssignment(repo, 'manager-1', 'owner-1')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'manager_not_found')
      assert.equal((error as DomainError).status, 404)
    }
  })

  test('lève la même erreur pour une affectation inexistante', async ({ assert }) => {
    // Même code, même message, même statut que pour un gérant d'autrui : cette
    // uniformité empêche l'appelant de déduire, par la réponse, qu'un compte
    // existe mais appartient à un autre propriétaire.
    const repo = repoReturning(null)

    try {
      await loadOwnedAssignment(repo, 'manager-inconnu', 'owner-1')
      assert.fail('aurait dû lever')
    } catch (error) {
      assert.instanceOf(error, DomainError)
      assert.equal((error as DomainError).code, 'manager_not_found')
      assert.equal((error as DomainError).message, 'Ce gérant est introuvable.')
      assert.equal((error as DomainError).status, 404)
    }
  })

  test('refuse même une affectation suspendue appartenant à un tiers', async ({ assert }) => {
    // La suspension ne relâche pas l'isolation : le propriétaire de
    // l'affectation reste le seul critère de la garde.
    const suspended = { ...assignmentOf('owner-2'), is_active: false }
    const repo = repoReturning(suspended)

    await assert.rejects(() => loadOwnedAssignment(repo, 'manager-1', 'owner-1'))
  })
})
