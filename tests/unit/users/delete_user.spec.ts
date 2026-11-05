import { test } from '@japa/runner'

import { DeleteUserUseCase } from '#features/users/use_cases/delete_user.use_case'
import { RestoreUserUseCase } from '#features/users/use_cases/restore_user.use_case'
import { DomainError } from '#utils/domain_error'

import type UserRepository from '#features/users/repositories/user_repository'
import type { UserRecord } from '#models/user'

/**
 * Dépôt en mémoire : `markDeleted` et `markRestored` reproduisent les champs
 * qu'écrit le dépôt réel, pour vérifier l'aller-retour suppression/restauration.
 */
function fakeRepo(initial: Partial<UserRecord> & { is_active: boolean }) {
  const data: Partial<UserRecord> = {
    _id: 'user-1',
    role_id: 'client',
    full_name: 'Awa',
    email: 'awa@example.com',
    phone: null,
    auth_channel: 'email',
    metadata: {
      created_by: null,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    },
    ...initial,
  }
  const calls = { revoked: 0 }

  const entity = {
    _id: 'user-1',
    get raw() {
      return data
    },
    get is_active() {
      return data.is_active
    },
  }

  const repo = {
    findEntity: async (id: string) => (id === 'user-1' ? entity : null),
    markDeleted: async (_user: unknown, adminId: string) => {
      Object.assign(data, {
        active_before_deletion: data.is_active,
        is_active: false,
        is_deleted: true,
        deleted_at: new Date('2026-11-05'),
        deleted_by: adminId,
      })
      return entity
    },
    markRestored: async () => {
      Object.assign(data, {
        is_active: data.active_before_deletion ?? true,
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        active_before_deletion: null,
      })
      return entity
    },
    revokeSessions: async () => {
      calls.revoked += 1
      return 3
    },
  }

  return { repo: repo as unknown as UserRepository, calls, data }
}

async function expectDomainError(promise: Promise<unknown>, code: string, status: number) {
  try {
    await promise
  } catch (error) {
    if (!(error instanceof DomainError)) throw error
    if (error.code !== code || error.status !== status) {
      throw new Error(`Attendu ${code}/${status}, reçu ${error.code}/${error.status}`)
    }
    return
  }
  throw new Error(`Aucune erreur levée, ${code} attendu`)
}

test.group('DeleteUserUseCase', () => {
  test('désactive le compte, le marque supprimé et ferme ses sessions', async ({ assert }) => {
    const { repo, calls } = fakeRepo({ is_active: true })

    const result = await new DeleteUserUseCase(repo).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
    })

    assert.isFalse(result.user.is_active)
    assert.instanceOf(result.user.deleted_at, Date)
    assert.equal(calls.revoked, 1)
    assert.equal(result.revoked_sessions, 3)
  })

  test('refuse qu’un administrateur se supprime lui-même', async () => {
    const { repo } = fakeRepo({ is_active: true })
    await expectDomainError(
      new DeleteUserUseCase(repo).execute({ user_id: 'user-1', admin_id: 'user-1' }),
      'cannot_delete_self',
      409
    )
  })

  test('refuse un compte déjà supprimé', async () => {
    const { repo } = fakeRepo({ is_active: false, is_deleted: true })
    await expectDomainError(
      new DeleteUserUseCase(repo).execute({ user_id: 'user-1', admin_id: 'admin-1' }),
      'user_already_deleted',
      409
    )
  })

  test('signale un compte introuvable', async () => {
    const { repo } = fakeRepo({ is_active: true })
    await expectDomainError(
      new DeleteUserUseCase(repo).execute({ user_id: 'inconnu', admin_id: 'admin-1' }),
      'user_not_found',
      404
    )
  })
})

test.group('RestoreUserUseCase', () => {
  test('rend l’accès à un compte actif avant sa suppression', async ({ assert }) => {
    const { repo } = fakeRepo({ is_active: true })
    await new DeleteUserUseCase(repo).execute({ user_id: 'user-1', admin_id: 'admin-1' })

    const restored = await new RestoreUserUseCase(repo).execute('user-1')

    assert.isTrue(restored.is_active)
    assert.isNull(restored.deleted_at)
  })

  test('laisse désactivé un compte que l’équipe avait désactivé', async ({ assert }) => {
    const { repo } = fakeRepo({ is_active: false })
    await new DeleteUserUseCase(repo).execute({ user_id: 'user-1', admin_id: 'admin-1' })

    const restored = await new RestoreUserUseCase(repo).execute('user-1')

    assert.isFalse(restored.is_active)
  })

  test('refuse un compte qui n’est pas supprimé', async () => {
    const { repo } = fakeRepo({ is_active: true })
    await expectDomainError(new RestoreUserUseCase(repo).execute('user-1'), 'user_not_deleted', 409)
  })
})
