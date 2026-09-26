import { test } from '@japa/runner'

import { MAX_EXTENSION_DAYS, planExtension } from '#features/subscriptions/subscription_extension'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-26T10:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

test.group('planExtension', () => {
  test("ajoute les jours à l'échéance en cours", ({ assert }) => {
    const patch = planExtension(
      { status: 'active', is_trial: false, end_date: inDays(10) },
      30,
      NOW
    )

    assert.deepEqual(patch, { end_date: inDays(40) })
  })

  test("un essai prolongé décale aussi sa fin d'essai", ({ assert }) => {
    const patch = planExtension({ status: 'trial', is_trial: true, end_date: inDays(3) }, 7, NOW)

    assert.deepEqual(patch, { end_date: inDays(10), trial_ends_at: inDays(10) })
  })

  test('une échéance déjà passée repart de maintenant', ({ assert }) => {
    const patch = planExtension({ status: 'active', is_trial: false, end_date: inDays(-2) }, 7, NOW)

    assert.deepEqual(patch.end_date, inDays(7))
  })

  test('un abonnement échu, annulé ou non payé ne se prolonge pas', ({ assert }) => {
    for (const status of ['expired', 'cancelled', 'pending'] as const) {
      assert.throws(
        () => planExtension({ status, is_trial: false, end_date: inDays(5) }, 7, NOW),
        'Seul un abonnement en cours peut être prolongé.'
      )
    }
  })

  test('la durée est bornée et entière', ({ assert }) => {
    const active = { status: 'active' as const, is_trial: false, end_date: inDays(5) }

    assert.throws(() => planExtension(active, 0, NOW))
    assert.throws(() => planExtension(active, 1.5, NOW))
    assert.throws(() => planExtension(active, MAX_EXTENSION_DAYS + 1, NOW))
    assert.doesNotThrow(() => planExtension(active, MAX_EXTENSION_DAYS, NOW))
  })
})
