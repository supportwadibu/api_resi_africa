import { test } from '@japa/runner'

import SetPropertyVisibilityAsAdminUseCase from '#features/properties/use_cases/set_property_visibility_as_admin.use_case'
import { DomainError } from '#utils/domain_error'

import type OwnerRepository from '#features/owners/repositories/owner_repository'
import type PropertyRepository from '#features/properties/repositories/property_repository'

/** Dépôts en mémoire : seules les méthodes lues par le use case. */
function fakes(options: { property?: boolean; ownerStatus?: string; ownerProfileSubmitted?: boolean }) {
  const updates: Array<{ id: string; input: any; ownerId?: string }> = []
  const property = options.property === false ? null : { id: 'p1', owner_id: 'o1' }

  const repo = {
    async findById(id: string) {
      return property && property.id === id ? property : null
    },
    async update(id: string, input: any, ownerId?: string) {
      updates.push({ id, input, ownerId })
      return { ...property, ...input }
    },
  }
  const owners = {
    async findById() {
      return {
        id: 'o1',
        owner_status: options.ownerStatus ?? 'pending',
        profile_submitted: options.ownerProfileSubmitted ?? false,
      }
    },
  }

  const useCase = new SetPropertyVisibilityAsAdminUseCase(
    repo as unknown as Pick<PropertyRepository, 'findById' | 'update'>,
    owners as unknown as Pick<OwnerRepository, 'findById'>
  )
  return { useCase, updates }
}

async function rejects(promise: Promise<unknown>, code: string, assert: any) {
  try {
    await promise
    assert.fail('aurait dû être refusé')
  } catch (error) {
    assert.instanceOf(error, DomainError)
    assert.equal((error as DomainError).code, code)
  }
}

test.group('SetPropertyVisibilityAsAdminUseCase', () => {
  test('publie sans dossier déposé, quel que soit le propriétaire', async ({ assert }) => {
    const { useCase, updates } = fakes({ ownerProfileSubmitted: false })
    await useCase.execute('p1', true)

    assert.equal(updates[0].input.status, 'published')
    assert.isTrue(updates[0].input.visibility.is_public)
    assert.instanceOf(updates[0].input.visibility.published_at, Date)
    // Aucun contrôle d'appartenance : l'admin agit sur tout logement.
    assert.isUndefined(updates[0].ownerId)
  })

  test('refuse de publier pour un compte rejeté ou suspendu', async ({ assert }) => {
    for (const ownerStatus of ['rejected', 'suspended']) {
      const { useCase, updates } = fakes({ ownerStatus })
      await rejects(useCase.execute('p1', true), 'owner_not_operational', assert)
      assert.lengthOf(updates, 0)
    }
  })

  test('retire de la vitrine, même pour un compte suspendu', async ({ assert }) => {
    const { useCase, updates } = fakes({ ownerStatus: 'suspended' })
    await useCase.execute('p1', false)

    assert.equal(updates[0].input.status, 'draft')
    assert.isFalse(updates[0].input.visibility.is_public)
  })

  test('logement inconnu : 404', async ({ assert }) => {
    const { useCase } = fakes({ property: false })
    await rejects(useCase.execute('p1', true), 'property_not_found', assert)
  })
})
