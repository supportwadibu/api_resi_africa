import { test } from '@japa/runner'

import { parseAdminSeeds } from '#features/users/admin_seeds'
import { EnsureAdminsUseCase } from '#features/users/use_cases/ensure_admins.use_case'
import { DomainError } from '#utils/domain_error'

import type { UserDocument, UserRecord } from '#models/user'

const ADMIN = {
  full_name: 'Awa Koné',
  email: 'awa@exemple.ci',
  password: 'motdepasse-solide',
}

/** Dépôt en mémoire : des comptes existants par e-mail, et les créations observées. */
function fakeRepo(options: {
  roleId?: string | null
  accounts?: Record<string, Pick<UserRecord, 'role_id'>>
  takenPhones?: string[]
}) {
  const created: Partial<UserDocument>[] = []
  const repo = {
    async findRoleId() {
      return options.roleId === undefined ? 'admin' : options.roleId
    },
    async findByEmail(email: string) {
      return (options.accounts?.[email] as UserRecord | undefined) ?? null
    },
    async createAccount(input: Partial<UserDocument>) {
      if (input.phone && options.takenPhones?.includes(input.phone)) {
        throw new Error(`Un compte existe déjà avec le numéro ${input.phone}.`)
      }
      created.push(input)
      return { ...input, _id: `user-${created.length}` } as UserRecord
    },
  }
  return { repo, created }
}

const hash = async (value: string) => `hash(${value})`

test.group('parseAdminSeeds', () => {
  test('variable absente ou vide : aucun admin, aucune erreur', async ({ assert }) => {
    assert.deepEqual(await parseAdminSeeds(undefined), { admins: [], errors: [] })
    assert.deepEqual(await parseAdminSeeds('  '), { admins: [], errors: [] })
  })

  test('JSON illisible : erreur qui ne recopie pas la valeur', async ({ assert }) => {
    const { admins, errors } = await parseAdminSeeds('[{"password":"secret-en-clair"')
    assert.lengthOf(admins, 0)
    assert.lengthOf(errors, 1)
    assert.notInclude(errors[0], 'secret-en-clair')
  })

  test('refuse autre chose qu’un tableau', async ({ assert }) => {
    const { errors } = await parseAdminSeeds(JSON.stringify(ADMIN))
    assert.deepEqual(errors, ['BOOTSTRAP_ADMINS doit être un tableau JSON.'])
  })

  test('normalise l’e-mail comme à l’inscription', async ({ assert }) => {
    const { admins } = await parseAdminSeeds(
      JSON.stringify([{ ...ADMIN, email: '  Awa@Exemple.CI ' }])
    )
    assert.equal(admins[0].email, 'awa@exemple.ci')
  })

  test('écarte une entrée invalide sans bloquer les autres', async ({ assert }) => {
    const { admins, errors } = await parseAdminSeeds(
      JSON.stringify([
        { ...ADMIN, password: 'court' },
        { ...ADMIN, email: 'kofi@exemple.ci' },
      ])
    )
    assert.deepEqual(
      admins.map((admin) => admin.email),
      ['kofi@exemple.ci']
    )
    assert.lengthOf(errors, 1)
    assert.match(errors[0], /^BOOTSTRAP_ADMINS\[0\]\.password/)
  })

  test('ignore un e-mail en double', async ({ assert }) => {
    const { admins, errors } = await parseAdminSeeds(
      JSON.stringify([ADMIN, { ...ADMIN, email: 'AWA@exemple.ci' }])
    )
    assert.lengthOf(admins, 1)
    assert.lengthOf(errors, 1)
  })
})

test.group('EnsureAdminsUseCase', () => {
  test('crée un compte admin vérifié, mot de passe haché', async ({ assert }) => {
    const { repo, created } = fakeRepo({})
    const report = await new EnsureAdminsUseCase(repo, hash).execute([ADMIN])

    assert.deepEqual(report.created, ['awa@exemple.ci'])
    assert.equal(created[0].role_id, 'admin')
    assert.equal(created[0].password, 'hash(motdepasse-solide)')
    assert.isTrue(created[0].is_verified)
    assert.isTrue(created[0].is_active)
  })

  test('rejouable : un admin existant n’est pas réécrit', async ({ assert }) => {
    const { repo, created } = fakeRepo({ accounts: { 'awa@exemple.ci': { role_id: 'admin' } } })
    const report = await new EnsureAdminsUseCase(repo, hash).execute([ADMIN])

    assert.deepEqual(report.existing, ['awa@exemple.ci'])
    assert.lengthOf(created, 0)
  })

  test('ne promeut jamais un compte d’un autre rôle', async ({ assert }) => {
    const { repo, created } = fakeRepo({ accounts: { 'awa@exemple.ci': { role_id: 'proprio' } } })
    const report = await new EnsureAdminsUseCase(repo, hash).execute([ADMIN])

    assert.lengthOf(created, 0)
    assert.equal(report.conflicts[0].email, 'awa@exemple.ci')
  })

  test('un téléphone déjà pris n’empêche pas les autres créations', async ({ assert }) => {
    const { repo } = fakeRepo({ takenPhones: ['+2250700000000'] })
    const report = await new EnsureAdminsUseCase(repo, hash).execute([
      { ...ADMIN, phone: '+2250700000000' },
      { ...ADMIN, email: 'kofi@exemple.ci' },
    ])

    assert.deepEqual(report.created, ['kofi@exemple.ci'])
    assert.equal(report.conflicts[0].email, 'awa@exemple.ci')
  })

  test('rôle admin absent : erreur explicite', async ({ assert }) => {
    const { repo } = fakeRepo({ roleId: null })
    await assert.rejects(() => new EnsureAdminsUseCase(repo, hash).execute([ADMIN]), DomainError)
  })

  test('liste vide : aucune lecture', async ({ assert }) => {
    const { repo } = fakeRepo({ roleId: null })
    const report = await new EnsureAdminsUseCase(repo, hash).execute([])
    assert.deepEqual(report, { created: [], existing: [], conflicts: [] })
  })
})
