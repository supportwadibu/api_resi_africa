import { test } from '@japa/runner'

import { UpdateUserUseCase } from '#features/users/use_cases/update_user.use_case'
import { DomainError } from '#utils/domain_error'

import type UserRepository from '#features/users/repositories/user_repository'
import type { UserRecord } from '#models/user'

/**
 * Doublure du dépôt : un compte en mémoire, dont on observe les écritures et
 * les révocations. Le use case n'a besoin que de ces quelques méthodes.
 */
function fakeRepo(
  initial: Partial<UserRecord> & { is_active: boolean },
  taken: { email?: string; phone?: string } = {}
) {
  const data = {
    _id: 'user-1',
    role_id: 'client',
    full_name: 'Awa',
    email: 'awa@example.com',
    phone: '+2250700000000',
    auth_channel: 'email',
    metadata: { created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01') },
    ...initial,
  }
  const calls = { saved: 0, revoked: 0 }

  const entity = {
    get raw() {
      return data
    },
    get email() {
      return data.email
    },
    set email(v) {
      data.email = v
    },
    get phone() {
      return data.phone
    },
    set phone(v) {
      data.phone = v
    },
    get is_active() {
      return data.is_active
    },
    set is_active(v) {
      data.is_active = v
    },
    set full_name(v: string) {
      data.full_name = v
    },
  }

  const repo = {
    findEntity: async (id: string) => (id === 'user-1' ? entity : null),
    isEmailTaken: async (email: string) => email === taken.email,
    isPhoneTaken: async (phone: string) => phone === taken.phone,
    save: async () => {
      calls.saved += 1
    },
    revokeSessions: async () => {
      calls.revoked += 1
      return 2
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

test.group('UpdateUserUseCase', () => {
  test('refuse qu’un administrateur se désactive lui-même', async () => {
    const { repo } = fakeRepo({ is_active: true })

    await expectDomainError(
      new UpdateUserUseCase(repo).execute({
        user_id: 'user-1',
        admin_id: 'user-1',
        patch: { is_active: false },
      }),
      'cannot_deactivate_self',
      409
    )
  })

  test('désactiver un compte ferme ses sessions', async ({ assert }) => {
    const { repo, calls } = fakeRepo({ is_active: true })

    const result = await new UpdateUserUseCase(repo).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
      patch: { is_active: false },
    })

    assert.isFalse(result.user.is_active)
    assert.equal(calls.revoked, 1)
    assert.equal(result.revoked_sessions, 2)
  })

  test('ne révoque rien pour un compte déjà inactif ou réactivé', async ({ assert }) => {
    const inactive = fakeRepo({ is_active: false })
    await new UpdateUserUseCase(inactive.repo).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
      patch: { is_active: false },
    })
    assert.equal(inactive.calls.revoked, 0)

    const reactivated = fakeRepo({ is_active: false })
    await new UpdateUserUseCase(reactivated.repo).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
      patch: { is_active: true },
    })
    assert.equal(reactivated.calls.revoked, 0)
  })

  test('refuse un e-mail déjà porté par un autre compte', async ({ assert }) => {
    const { repo, calls } = fakeRepo({ is_active: true }, { email: 'pris@example.com' })

    await expectDomainError(
      new UpdateUserUseCase(repo).execute({
        user_id: 'user-1',
        admin_id: 'admin-1',
        patch: { email: 'pris@example.com' },
      }),
      'email_already_used',
      409
    )
    assert.equal(calls.saved, 0)
  })

  test('refuse un téléphone déjà porté par un autre compte', async () => {
    const { repo } = fakeRepo({ is_active: true }, { phone: '+2250799999999' })

    await expectDomainError(
      new UpdateUserUseCase(repo).execute({
        user_id: 'user-1',
        admin_id: 'admin-1',
        patch: { phone: '+2250799999999' },
      }),
      'phone_already_used',
      409
    )
  })

  test('ne contrôle pas l’unicité d’un e-mail inchangé', async ({ assert }) => {
    // Renvoyer l'e-mail actuel dans le formulaire ne doit pas se heurter au
    // compte lui-même.
    const { repo, data } = fakeRepo({ is_active: true }, { email: 'awa@example.com' })

    await new UpdateUserUseCase(repo).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
      patch: { email: 'awa@example.com', full_name: 'Awa Koné' },
    })

    assert.equal(data.full_name, 'Awa Koné')
  })

  test('signale un compte introuvable', async () => {
    const { repo } = fakeRepo({ is_active: true })

    await expectDomainError(
      new UpdateUserUseCase(repo).execute({
        user_id: 'inconnu',
        admin_id: 'admin-1',
        patch: { full_name: 'X' },
      }),
      'user_not_found',
      404
    )
  })
})
