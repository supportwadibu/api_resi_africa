import { test } from '@japa/runner'

import { RateLimiter } from '#utils/rate_limiter'

test.group('RateLimiter', () => {
  test('laisse passer jusqu’au plafond, puis refuse', ({ assert }) => {
    const limiter = new RateLimiter()
    const now = 1_000_000

    const results = Array.from({ length: 4 }, () => limiter.hit('k', 3, 60_000, now))

    assert.deepEqual(
      results.map((r) => r.allowed),
      [true, true, true, false]
    )
    assert.deepEqual(
      results.map((r) => r.remaining),
      [2, 1, 0, 0]
    )
  })

  test('annonce le délai avant la fenêtre suivante', ({ assert }) => {
    const limiter = new RateLimiter()
    limiter.hit('k', 1, 60_000, 0)

    const refused = limiter.hit('k', 1, 60_000, 15_000)

    assert.isFalse(refused.allowed)
    assert.equal(refused.retryAfterSeconds, 45)
  })

  test('rouvre le quota à l’échéance de la fenêtre', ({ assert }) => {
    const limiter = new RateLimiter()
    limiter.hit('k', 1, 60_000, 0)
    assert.isFalse(limiter.hit('k', 1, 60_000, 59_999).allowed)

    assert.isTrue(limiter.hit('k', 1, 60_000, 60_000).allowed)
  })

  test('compte chaque clé à part', ({ assert }) => {
    const limiter = new RateLimiter()
    limiter.hit('auth:ip:1.1.1.1', 1, 60_000, 0)

    assert.isTrue(limiter.hit('auth:ip:2.2.2.2', 1, 60_000, 0).allowed)
    assert.isFalse(limiter.hit('auth:ip:1.1.1.1', 1, 60_000, 0).allowed)
  })

  test('oublie les fenêtres échues, pour ne pas garder chaque IP vue', ({ assert }) => {
    const limiter = new RateLimiter(1_000)
    limiter.hit('a', 5, 500, 0)
    limiter.hit('b', 5, 500, 0)
    assert.equal(limiter.size, 2)

    limiter.hit('c', 5, 500, 2_000)

    assert.equal(limiter.size, 1)
  })
})
