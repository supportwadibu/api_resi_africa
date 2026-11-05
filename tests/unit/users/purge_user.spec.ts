import { test } from '@japa/runner'

import { COLLECTIONS } from '#firebase/firestore'
import { isSponsorshipErasable, PURGE_STEPS, purgeFilePrefixes } from '#features/users/purge_plan'
import { PurgeUserUseCase } from '#features/users/use_cases/purge_user.use_case'
import { DomainError } from '#utils/domain_error'

import type UserPurgeRepository from '#features/users/repositories/user_purge_repository'
import type UserRepository from '#features/users/repositories/user_repository'

/** Compte en mémoire, et l'ordre des opérations de purge observées. */
function fakes(account: { is_deleted?: boolean } | null) {
  const log: string[] = []

  const users = {
    findEntity: async (id: string) =>
      account && id === 'user-1'
        ? {
            _id: 'user-1',
            full_name: 'Awa',
            email: 'awa@example.com',
            phone: null,
            raw: { _id: 'user-1', ...account },
          }
        : null,
  }

  const purge = {
    freezeClientSnapshots: async (_id: string, snapshot: { full_name: string }) => {
      log.push(`freeze:${snapshot.full_name}`)
      return 0
    },
    deleteFiles: async () => {
      log.push('files')
      return 4
    },
    deleteSponsorshipLinks: async () => {
      log.push('sponsorship')
      return [{ key: 'sponsorship_code', label: 'Code de parrainage', count: 1 }]
    },
    deleteSteps: async () => {
      log.push('steps')
      return [{ key: 'properties', label: 'Logements', count: 2 }]
    },
    deleteAuthTraces: async (_id: string, identifiers: (string | null)[]) => {
      log.push(`auth:${identifiers.filter(Boolean).join(',')}`)
    },
    deleteUser: async () => {
      log.push('user')
    },
  }

  return {
    users: users as unknown as UserRepository,
    purge: purge as unknown as UserPurgeRepository,
    log,
  }
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

test.group('Plan de suppression définitive', () => {
  test('n’efface pas les réservations prises en tant que client', ({ assert }) => {
    // Elles appartiennent à la comptabilité du propriétaire.
    const clientSide = PURGE_STEPS.filter(
      (step) =>
        step.kind === 'query' &&
        (step.collection === COLLECTIONS.bookings ||
          step.collection === COLLECTIONS.bookingPayments) &&
        step.field === 'client_id'
    )
    assert.lengthOf(clientSide, 0)
  })

  test('efface les données rattachées au propriétaire', ({ assert }) => {
    const ownerCollections = PURGE_STEPS.filter(
      (step) => step.kind === 'query' && step.field === 'owner_id'
    ).map((step) => step.collection)

    for (const name of [
      COLLECTIONS.properties,
      COLLECTIONS.residences,
      COLLECTIONS.bookings,
      COLLECTIONS.bookingPayments,
      COLLECTIONS.clients,
      COLLECTIONS.expenses,
      COLLECTIONS.wallets,
      COLLECTIONS.walletTransactions,
      COLLECTIONS.withdrawalRequests,
    ]) {
      assert.include(ownerCollections, name)
    }
  })

  test('n’efface ni le compte ni le journal d’audit', ({ assert }) => {
    // Le compte est effacé à part, en dernier ; l'audit garde sa rétention.
    const collections = PURGE_STEPS.map((step) => step.collection)
    assert.notInclude(collections, COLLECTIONS.users)
    assert.notInclude(collections, COLLECTIONS.auditLogs)
  })

  test('chaque étape a une clé unique', ({ assert }) => {
    const keys = PURGE_STEPS.map((step) => step.key)
    assert.equal(new Set(keys).size, keys.length)
  })

  test('range les fichiers sous le dossier du compte', ({ assert }) => {
    const prefixes = purgeFilePrefixes('user-1')
    assert.deepEqual(prefixes.images, ['user-1/'])
    assert.deepEqual(prefixes.documents, ['owners/user-1/', 'clients/user-1/'])
  })

  test('n’efface un parrainage reçu que s’il n’a rien rapporté', ({ assert }) => {
    assert.isTrue(isSponsorshipErasable('registered'))
    for (const status of ['pending', 'earned', 'cancelled', null, undefined]) {
      assert.isFalse(isSponsorshipErasable(status))
    }
  })
})

test.group('PurgeUserUseCase', () => {
  test('exige une suppression douce préalable', async ({ assert }) => {
    const { users, purge, log } = fakes({ is_deleted: false })
    await expectDomainError(
      new PurgeUserUseCase(users, purge).execute({ user_id: 'user-1', admin_id: 'admin-1' }),
      'user_not_deleted',
      409
    )
    assert.lengthOf(log, 0)
  })

  test('refuse qu’un administrateur se supprime lui-même', async () => {
    const { users, purge } = fakes({ is_deleted: true })
    await expectDomainError(
      new PurgeUserUseCase(users, purge).execute({ user_id: 'user-1', admin_id: 'user-1' }),
      'cannot_delete_self',
      409
    )
  })

  test('signale un compte introuvable', async () => {
    const { users, purge } = fakes(null)
    await expectDomainError(
      new PurgeUserUseCase(users, purge).execute({ user_id: 'user-1', admin_id: 'admin-1' }),
      'user_not_found',
      404
    )
  })

  test('fige le nom d’abord, efface le compte en dernier', async ({ assert }) => {
    const { users, purge, log } = fakes({ is_deleted: true })

    const report = await new PurgeUserUseCase(users, purge).execute({
      user_id: 'user-1',
      admin_id: 'admin-1',
    })

    // Le compte effacé en dernier rend la suppression rejouable après une panne.
    assert.deepEqual(log, [
      'freeze:Awa',
      'files',
      'sponsorship',
      'steps',
      'auth:awa@example.com',
      'user',
    ])
    assert.equal(report.files_deleted, 4)
    assert.deepEqual(
      report.items.map((item) => item.key),
      ['properties', 'sponsorship_code']
    )
  })
})
