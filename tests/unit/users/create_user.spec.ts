import { test } from '@japa/runner'

import { authChannelFor, CreateUserUseCase } from '#features/users/use_cases/create_user.use_case'
import { DomainError } from '#utils/domain_error'

import type { CreateManagerInput } from '#features/managers/dto/manager.dto'
import type { UserDocument, UserEntity, UserRecord } from '#models/user'

/**
 * Dépôt en mémoire : des comptes existants, et les créations observées. Un
 * compte créé devient lisible par `findEntity`, comme après l'écriture réelle.
 */
function fakeRepo(
  options: {
    accounts?: Partial<UserRecord>[]
    roleId?: string | null
    raceOnCreate?: boolean
  } = {}
) {
  const accounts: Partial<UserRecord>[] = [...(options.accounts ?? [])]
  const created: Partial<UserDocument>[] = []

  const repo = {
    async findRoleId(name: string) {
      return options.roleId === undefined ? name : options.roleId
    },
    async findEntity(id: string) {
      const doc = accounts.find((account) => account._id === id)
      return doc
        ? ({ _id: doc._id, role_id: doc.role_id, raw: doc } as unknown as UserEntity)
        : null
    },
    async isEmailTaken(email: string) {
      return accounts.some((account) => account.email === email)
    },
    async isPhoneTaken(phone: string) {
      return accounts.some((account) => account.phone === phone)
    },
    async createAccount(input: Partial<UserDocument>) {
      if (options.raceOnCreate) throw new Error('Un compte existe déjà.')
      created.push(input)
      const record = {
        ...input,
        _id: `user-${created.length}`,
        metadata: { created_by: null, created_at: new Date(), updated_at: new Date() },
      } as UserRecord
      accounts.push(record)
      return record
    },
  }

  const managers: CreateManagerInput[] = []
  const createManager = async (input: CreateManagerInput) => {
    managers.push(input)
    const record = {
      _id: `manager-${managers.length}`,
      role_id: 'gerant',
      full_name: input.full_name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      metadata: { created_by: input.owner_id, created_at: new Date(), updated_at: new Date() },
    } as UserRecord
    accounts.push(record)
    return { _id: record._id }
  }

  return { repo, created, managers, createManager }
}

const hash = async (value: string) => `hash(${value})`

const BASE = {
  full_name: 'Awa Koné',
  password: 'motdepasse-solide',
  admin_id: 'admin-1',
}

async function rejectsWith(promise: Promise<unknown>, code: string, assert: any) {
  try {
    await promise
    assert.fail(`attendu : ${code}`)
  } catch (error) {
    assert.instanceOf(error, DomainError)
    assert.equal((error as DomainError).code, code)
  }
}

test.group('authChannelFor', () => {
  test('un admin se connecte toujours par e-mail', ({ assert }) => {
    assert.equal(authChannelFor('admin', { email: 'a@b.ci', phone: '+2250700000000' }), 'email')
  })

  test('hors admin, le téléphone prime quand il est fourni', ({ assert }) => {
    assert.equal(authChannelFor('client', { email: 'a@b.ci', phone: '+2250700000000' }), 'phone')
    assert.equal(authChannelFor('proprio', { email: 'a@b.ci', phone: null }), 'email')
  })
})

test.group('CreateUserUseCase', () => {
  test('crée un client vérifié, mot de passe haché, créateur tracé', async ({ assert }) => {
    const { repo, created, createManager } = fakeRepo()
    const user = await new CreateUserUseCase(repo, hash, createManager).execute({
      ...BASE,
      role: 'client',
      phone: '+2250700000000',
    })

    assert.equal(user.role, 'client')
    assert.equal(created[0].password, 'hash(motdepasse-solide)')
    assert.isTrue(created[0].is_verified)
    assert.equal(created[0].auth_channel, 'phone')
    assert.equal(created[0].metadata?.created_by, 'admin-1')
  })

  test('un propriétaire naît sans décision de validation forcée', async ({ assert }) => {
    const { repo, created, managers, createManager } = fakeRepo()
    await new CreateUserUseCase(repo, hash, createManager).execute({
      ...BASE,
      role: 'proprio',
      email: 'awa@exemple.ci',
    })
    // `pending` vient de la valeur par défaut de `User.create` : le use case
    // ne pose aucun statut, le dossier suit le parcours de l'inscription.
    assert.notProperty(created[0], 'owner_status')
    assert.equal(created[0].auth_channel, 'email')
    assert.lengthOf(managers, 0)
  })

  test('refuse un compte sans e-mail ni téléphone', async ({ assert }) => {
    const { repo, createManager } = fakeRepo()
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({ ...BASE, role: 'client' }),
      'user_contact_required',
      assert
    )
  })

  test('refuse un admin sans e-mail', async ({ assert }) => {
    const { repo, createManager } = fakeRepo()
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({
        ...BASE,
        role: 'admin',
        phone: '+2250700000000',
      }),
      'admin_email_required',
      assert
    )
  })

  test('refuse un e-mail déjà porté par un autre compte', async ({ assert }) => {
    const { repo, created, createManager } = fakeRepo({
      accounts: [{ _id: 'u', role_id: 'client', email: 'awa@exemple.ci' }],
    })
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({
        ...BASE,
        role: 'client',
        email: 'awa@exemple.ci',
      }),
      'email_already_used',
      assert
    )
    assert.lengthOf(created, 0)
  })

  test('refuse un téléphone déjà porté, y compris pour un gérant', async ({ assert }) => {
    const { repo, managers, createManager } = fakeRepo({
      accounts: [
        { _id: 'owner-1', role_id: 'proprio' },
        { _id: 'u', role_id: 'client', phone: '+2250700000000' },
      ],
    })
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({
        ...BASE,
        role: 'gerant',
        phone: '+2250700000000',
        owner_id: 'owner-1',
      }),
      'phone_already_used',
      assert
    )
    assert.lengthOf(managers, 0)
  })

  test('un doublon apparu entre contrôle et écriture reste une erreur métier', async ({
    assert,
  }) => {
    const { repo, createManager } = fakeRepo({ raceOnCreate: true })
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({
        ...BASE,
        role: 'client',
        email: 'awa@exemple.ci',
      }),
      'account_already_exists',
      assert
    )
  })

  test('un gérant passe par la création de gérant, sans logement', async ({ assert }) => {
    const { repo, created, managers, createManager } = fakeRepo({
      accounts: [{ _id: 'owner-1', role_id: 'proprio' }],
    })
    const user = await new CreateUserUseCase(repo, hash, createManager).execute({
      ...BASE,
      role: 'gerant',
      phone: '+2250700000000',
      owner_id: 'owner-1',
    })

    assert.equal(user.role, 'gerant')
    assert.lengthOf(created, 0)
    assert.deepEqual(managers[0].property_ids, [])
    assert.equal(managers[0].owner_id, 'owner-1')
    // Le mot de passe est haché par la création de gérant, pas deux fois.
    assert.equal(managers[0].password, 'motdepasse-solide')
  })

  test('refuse un gérant rattaché à un compte qui n’est pas propriétaire', async ({ assert }) => {
    const { repo, managers, createManager } = fakeRepo({
      accounts: [{ _id: 'client-1', role_id: 'client' }],
    })
    await rejectsWith(
      new CreateUserUseCase(repo, hash, createManager).execute({
        ...BASE,
        role: 'gerant',
        phone: '+2250700000000',
        owner_id: 'client-1',
      }),
      'owner_not_found',
      assert
    )
    assert.lengthOf(managers, 0)
  })
})
