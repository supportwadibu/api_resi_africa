import { test } from '@japa/runner'

import { PurgeExpiredSessionsUseCase } from '#features/users/use_cases/purge_expired_sessions.use_case'
import AuthSession from '#models/auth_session'

test.group('PurgeExpiredSessionsUseCase', () => {
  test('boucle jusqu’à ce qu’aucune session ne reste à purger', async ({ assert }) => {
    const original = AuthSession.deleteExpired
    const batches = [500, 320, 0]
    let calls = 0

    AuthSession.deleteExpired = async () => {
      return batches[calls++]
    }

    try {
      const useCase = new PurgeExpiredSessionsUseCase()
      const result = await useCase.execute()

      assert.equal(result.deleted, 820)
      assert.equal(calls, 3)
    } finally {
      AuthSession.deleteExpired = original
    }
  })

  test('renvoie 0 lorsque aucune session n’est expirée', async ({ assert }) => {
    const original = AuthSession.deleteExpired
    let calls = 0

    AuthSession.deleteExpired = async () => {
      calls++
      return 0
    }

    try {
      const useCase = new PurgeExpiredSessionsUseCase()
      const result = await useCase.execute()

      assert.equal(result.deleted, 0)
      assert.equal(calls, 1)
    } finally {
      AuthSession.deleteExpired = original
    }
  })
})
