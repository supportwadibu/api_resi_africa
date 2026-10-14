import { test } from '@japa/runner'

import ResolvePlanAccessUseCase from '#features/subscriptions/use_cases/resolve_plan_access.use_case'

import type OwnerRepository from '#features/owners/repositories/owner_repository'
import type SubscriptionRepository from '#features/subscriptions/repositories/subscription_repository'

const NOW = new Date('2026-09-26T10:00:00Z')
const LATER = new Date('2026-10-10T10:00:00Z')

/** Doublures minimales : seules les méthodes lues par le use case. */
function useCase(options: {
  live?: Array<Record<string, unknown>>
  everSubscribed?: boolean
  ownerStatus?: string | null
}) {
  const started: string[] = []
  const repo = {
    findLiveByUser: async () => options.live ?? [],
    existsForUser: async () => options.everSubscribed ?? false,
    startTrialOnce: async (userId: string) => {
      started.push(userId)
      return null
    },
  } as unknown as SubscriptionRepository
  const owners = {
    findById: async () =>
      options.ownerStatus === null ? null : { owner_status: options.ownerStatus ?? 'pending' },
  } as unknown as OwnerRepository

  return { resolve: new ResolvePlanAccessUseCase(repo, owners), started }
}

test.group('ResolvePlanAccessUseCase — essai garanti', () => {
  test('un propriétaire jamais abonné reçoit son essai et l’accès complet', async ({ assert }) => {
    const { resolve, started } = useCase({})

    assert.equal(await resolve.execute('owner-1', NOW), 'full')
    assert.deepEqual(started, ['owner-1'])
  })

  test('un essai en cours ouvre l’accès sans rien écrire', async ({ assert }) => {
    const { resolve, started } = useCase({
      live: [{ status: 'trial', is_trial: true, end_date: LATER }],
      everSubscribed: true,
    })

    assert.equal(await resolve.execute('owner-1', NOW), 'full')
    assert.deepEqual(started, [])
  })

  test('un essai échu ne se rouvre pas : il faut souscrire', async ({ assert }) => {
    const { resolve, started } = useCase({ everSubscribed: true })

    assert.isNull(await resolve.execute('owner-1', NOW))
    assert.deepEqual(started, [])
  })

  test('un compte rejeté ou suspendu ne reçoit pas d’essai', async ({ assert }) => {
    for (const ownerStatus of ['rejected', 'suspended']) {
      const { resolve, started } = useCase({ ownerStatus })

      assert.isNull(await resolve.execute('owner-1', NOW))
      assert.deepEqual(started, [])
    }
  })
})
