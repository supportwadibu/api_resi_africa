import { test } from '@japa/runner'

import { UpdateAdminProfileUseCase } from '#features/users/use_cases/update_admin_profile.use_case'
import HashService from '#services/hash_service'
import { DomainError } from '#utils/domain_error'

import type UserRepository from '#features/users/repositories/user_repository'
import type { UserRecord } from '#models/user'

const CURRENT = 'ancien-mot-de-passe'

/** Condensat calculé une fois : bcrypt à coût 12 ralentirait chaque test. */
let currentHash: Promise<string> | null = null

/**
 * Doublure du dépôt : le compte de l'administrateur en mémoire, dont on
 * observe les écritures et les révocations.
 */
async function fakeRepo(
  initial: Partial<UserRecord> = {},
  taken: { email?: string; phone?: string } = {}
) {
  currentHash ??= HashService.make(CURRENT)
  const data: Record<string, unknown> = {
    _id: 'admin-1',
    role_id: 'admin',
    full_name: 'Awa',
    email: 'awa@example.com',
    phone: '+2250700000000',
    password: await currentHash,
    auth_channel: 'email',
    is_active: true,
    is_verified: true,
    metadata: { created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01') },
    ...initial,
  }
  const calls = { saved: 0, revoked: [] as { keep: string; reason: string }[] }

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
    get password() {
      return data.password
    },
    set password(v) {
      data.password = v
    },
    set full_name(v: string) {
      data.full_name = v
    },
  }

  const repo = {
    findEntity: async (id: string) => (id === 'admin-1' ? entity : null),
    isEmailTaken: async (email: string) => email === taken.email,
    isPhoneTaken: async (phone: string) => phone === taken.phone,
    save: async () => {
      calls.saved += 1
    },
    revokeOtherSessions: async (_id: string, keep: string, reason: string) => {
      calls.revoked.push({ keep, reason })
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

function run(
  repo: UserRepository,
  patch: Parameters<UpdateAdminProfileUseCase['execute']>[0]['patch']
) {
  return new UpdateAdminProfileUseCase(repo).execute({
    admin_id: 'admin-1',
    current_jti: 'jti-courant',
    patch,
  })
}

test.group('UpdateAdminProfileUseCase — nom', () => {
  test('change le nom sans mot de passe actuel', async ({ assert }) => {
    const { repo, calls, data } = await fakeRepo()

    const result = await run(repo, { full_name: 'Awa Koné' })

    assert.equal(data.full_name, 'Awa Koné')
    assert.equal(calls.saved, 1)
    assert.lengthOf(calls.revoked, 0)
    assert.equal(result.revoked_sessions, 0)
  })

  test('renvoyer les coordonnées actuelles n’exige pas le mot de passe', async ({ assert }) => {
    // Le formulaire renvoie e-mail et téléphone avec le nom : inchangés, ils
    // ne doivent pas bloquer un simple changement de nom.
    const { repo, data } = await fakeRepo()

    await run(repo, { full_name: 'Awa K.', email: 'awa@example.com', phone: '+2250700000000' })

    assert.equal(data.full_name, 'Awa K.')
  })
})

test.group('UpdateAdminProfileUseCase — identifiants', () => {
  test('exige le mot de passe actuel pour changer l’e-mail', async ({ assert }) => {
    const { repo, calls } = await fakeRepo()

    await expectDomainError(
      run(repo, { email: 'nouvelle@example.com' }),
      'current_password_required',
      422
    )
    assert.equal(calls.saved, 0)
  })

  test('refuse un mot de passe actuel faux', async ({ assert }) => {
    const { repo, calls, data } = await fakeRepo()

    await expectDomainError(
      run(repo, { phone: '+2250711111111', current_password: 'mauvais' }),
      'invalid_credentials',
      422
    )
    assert.equal(calls.saved, 0)
    assert.equal(data.phone, '+2250700000000')
  })

  test('refuse un compte sans mot de passe, créé par Google', async () => {
    const { repo } = await fakeRepo({ password: null })

    await expectDomainError(
      run(repo, { email: 'nouvelle@example.com', current_password: CURRENT }),
      'invalid_credentials',
      422
    )
  })

  test('change l’e-mail avec le bon mot de passe, sans fermer de session', async ({ assert }) => {
    const { repo, calls, data } = await fakeRepo()

    await run(repo, { email: 'nouvelle@example.com', current_password: CURRENT })

    assert.equal(data.email, 'nouvelle@example.com')
    assert.lengthOf(calls.revoked, 0)
  })

  test('refuse un e-mail déjà porté par un autre compte', async ({ assert }) => {
    const { repo, calls } = await fakeRepo({}, { email: 'pris@example.com' })

    await expectDomainError(
      run(repo, { email: 'pris@example.com', current_password: CURRENT }),
      'email_already_used',
      409
    )
    assert.equal(calls.saved, 0)
  })

  test('retire le numéro sans contrôle d’unicité', async ({ assert }) => {
    const { repo, data } = await fakeRepo({}, { phone: '+2250700000000' })

    await run(repo, { phone: null, current_password: CURRENT })

    assert.isNull(data.phone)
  })
})

test.group('UpdateAdminProfileUseCase — mot de passe', () => {
  test('remplace le mot de passe et ferme les autres sessions', async ({ assert }) => {
    const { repo, calls, data } = await fakeRepo()

    const result = await run(repo, {
      current_password: CURRENT,
      new_password: 'nouveau-mot-de-passe',
    })

    assert.isTrue(await HashService.verify('nouveau-mot-de-passe', data.password as string))
    assert.deepEqual(calls.revoked, [{ keep: 'jti-courant', reason: 'password_changed' }])
    assert.equal(result.revoked_sessions, 3)
  })

  test('exige le mot de passe actuel', async ({ assert }) => {
    const { repo, calls } = await fakeRepo()

    await expectDomainError(
      run(repo, { new_password: 'nouveau-mot-de-passe' }),
      'current_password_required',
      422
    )
    assert.lengthOf(calls.revoked, 0)
  })

  test('signale un compte introuvable', async () => {
    const { repo } = await fakeRepo()

    await expectDomainError(
      new UpdateAdminProfileUseCase(repo).execute({
        admin_id: 'inconnu',
        current_jti: 'jti',
        patch: { full_name: 'X' },
      }),
      'user_not_found',
      404
    )
  })
})
