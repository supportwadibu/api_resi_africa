import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

import ThrottleMiddleware from '#middleware/throttle_middleware'

/** Nom propre à chaque test : le compteur du middleware est partagé. */
let counter = 0
const uniqueName = () => `test_${Date.now()}_${counter++}`

test.group('ThrottleMiddleware', () => {
  test('au-delà du plafond, répond 429 rate_limited avec Retry-After', async ({ assert }) => {
    const middleware = new ThrottleMiddleware()
    const options = { name: uniqueName(), max: 2, window: 60 }
    let reached = 0
    const next = async () => {
      reached += 1
    }

    for (let i = 0; i < 2; i++) {
      await middleware.handle(await testUtils.createHttpContext(), next, options)
    }
    const ctx = await testUtils.createHttpContext()
    await middleware.handle(ctx, next, options)

    assert.equal(reached, 2)
    assert.equal(ctx.response.getStatus(), 429)
    assert.equal(ctx.response.getHeader('Retry-After'), '60')
    assert.equal((ctx.response.getBody() as { code: string }).code, 'rate_limited')
  })

  test('derrière auth(), compte par compte et non par IP partagée', async ({ assert }) => {
    const middleware = new ThrottleMiddleware()
    const options = { name: uniqueName(), max: 1, window: 60, by: 'user' as const }
    const next = async () => {}

    const first = await testUtils.createHttpContext()
    first.authUser = { id: 'u1' } as typeof first.authUser
    await middleware.handle(first, next, options)

    // Même IP (celle du contexte de test), autre compte : quota distinct.
    const second = await testUtils.createHttpContext()
    second.authUser = { id: 'u2' } as typeof second.authUser
    await middleware.handle(second, next, options)

    assert.notEqual(second.response.getStatus(), 429)
  })
})
