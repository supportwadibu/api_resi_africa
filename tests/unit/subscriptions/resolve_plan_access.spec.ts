import { test } from '@japa/runner'

import ResolvePlanAccessUseCase from '#features/subscriptions/use_cases/resolve_plan_access.use_case'

import type OwnerRepository from '#features/owners/repositories/owner_repository'
import type SubscriptionRepository from '#features/subscriptions/repositories/subscription_repository'

const NOW = new Date('2026-09-26T10:00:00Z')
const LATER = new Date('2026-10-10T10:00:00Z')

/** Doublures minimales : seules les méthodes lues par le use case. */
function useCase(options: { live?: Array<Record<string, unknown>>; ownerStatus?: string | null }) {
  const started: string[] = []
  const repo = {
    findLiveByUser: async () => options.live ?? [],
    existsForUser: async () => false,
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

test.group('ResolvePlanAccessUseCase', () => {
  test("un propriétaire jamais abonné ne reçoit plus d'essai d'office : RESI Basic", async ({
    assert,
  }) => {
    const { resolve, started } = useCase({})

    assert.equal(await resolve.execute('owner-1', NOW), 'free')
    assert.deepEqual(started, [])
  })

  test('un essai en cours ouvre le palier choisi', async ({ assert }) => {
    const { resolve } = useCase({
      live: [{ status: 'trial', is_trial: true, plan_tier: 'pro', end_date: LATER }],
    })

    assert.equal(await resolve.execute('owner-1', NOW), 'pro')
  })

  test('un compte rejeté ou suspendu sans abonnement n’a aucun accès', async ({ assert }) => {
    for (const ownerStatus of ['rejected', 'suspended']) {
      const { resolve } = useCase({ ownerStatus })

      assert.isNull(await resolve.execute('owner-1', NOW))
    }
  })
})
