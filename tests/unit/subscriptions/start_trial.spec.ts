import { test } from '@japa/runner'

import StartTrialForOwnerUseCase from '#features/subscriptions/use_cases/start_trial_for_owner.use_case'
import { DomainError } from '#utils/domain_error'

import type OwnerRepository from '#features/owners/repositories/owner_repository'
import type { PlanTier } from '#features/plans/plan_tier'
import type PlanRepository from '#features/plans/repositories/plan_repository'
import type SubscriptionRepository from '#features/subscriptions/repositories/subscription_repository'

/** Doublures minimales : seules les méthodes lues par le use case. */
function useCase(
  options: {
    everSubscribed?: boolean
    ownerStatus?: string | null
    activeTiers?: string[]
    alreadyOpened?: boolean
  } = {}
) {
  const started: Array<{ userId: string; days: number; tier: PlanTier }> = []
  const repo = {
    existsForUser: async () => options.everSubscribed ?? false,
    startTrialOnce: async (userId: string, days: number, tier: PlanTier) => {
      if (options.alreadyOpened) return null
      started.push({ userId, days, tier })
      return { _id: `trial_${userId}`, plan_tier: tier }
    },
  } as unknown as SubscriptionRepository
  const owners = {
    findById: async () =>
      options.ownerStatus === null ? null : { owner_status: options.ownerStatus ?? 'pending' },
  } as unknown as OwnerRepository
  const plans = {
    listActive: async () => (options.activeTiers ?? ['pro', 'pro_plus']).map((tier) => ({ tier })),
  } as unknown as PlanRepository

  return { startTrial: new StartTrialForOwnerUseCase(repo, owners, plans), started }
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    if (error instanceof DomainError) return error.code
    throw error
  }
}

test.group('StartTrialForOwnerUseCase', () => {
  test('ouvre un essai de 30 jours sur le palier choisi', async ({ assert }) => {
    for (const tier of ['pro', 'pro_plus'] as const) {
      const { startTrial, started } = useCase()

      await startTrial.execute({ user_id: 'owner-1', tier })

      assert.deepEqual(started, [{ userId: 'owner-1', days: 30, tier }])
    }
  })

  test('un dossier en attente de validation peut ouvrir son essai', async ({ assert }) => {
    const { startTrial, started } = useCase({ ownerStatus: 'pending' })

    await startTrial.execute({ user_id: 'owner-1', tier: 'pro' })

    assert.lengthOf(started, 1)
  })

  test('refuse un compte rejeté, suspendu ou sans fiche propriétaire', async ({ assert }) => {
    for (const ownerStatus of ['rejected', 'suspended', null]) {
      const { startTrial, started } = useCase({ ownerStatus })

      assert.equal(
        await codeOf(startTrial.execute({ user_id: 'owner-1', tier: 'pro' })),
        'trial_not_allowed'
      )
      assert.lengthOf(started, 0)
    }
  })

  test('refuse un second essai, ou un essai après un abonnement', async ({ assert }) => {
    const { startTrial, started } = useCase({ everSubscribed: true })

    assert.equal(
      await codeOf(startTrial.execute({ user_id: 'owner-1', tier: 'pro' })),
      'trial_already_used'
    )
    assert.lengthOf(started, 0)
  })

  test('refuse un essai ouvert entre-temps par une requête concurrente', async ({ assert }) => {
    const { startTrial } = useCase({ alreadyOpened: true })

    assert.equal(
      await codeOf(startTrial.execute({ user_id: 'owner-1', tier: 'pro_plus' })),
      'trial_already_used'
    )
  })

  test("refuse un palier qu'aucun plan actif ne vend", async ({ assert }) => {
    const { startTrial, started } = useCase({ activeTiers: ['pro_plus'] })

    assert.equal(
      await codeOf(startTrial.execute({ user_id: 'owner-1', tier: 'pro' })),
      'plan_not_available'
    )
    assert.lengthOf(started, 0)
  })
})
