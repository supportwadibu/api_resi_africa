import { test } from '@japa/runner'

import {
  REFRESH_REUSE_GRACE_MS,
  isRefreshReuse,
} from '#auth/use_cases/auth/refresh_tokens.use_case'

const NOW = new Date('2026-11-02T10:00:00Z')

function rotatedAgo(ms: number) {
  return {
    is_revoked: true,
    revoke_reason: 'rotated' as const,
    revoked_at: new Date(NOW.getTime() - ms),
  }
}

test.group('isRefreshReuse', () => {
  test('un token tourné qui revient après le délai de grâce trahit un vol', ({ assert }) => {
    assert.isTrue(isRefreshReuse(rotatedAgo(REFRESH_REUSE_GRACE_MS + 1), NOW))
  })

  test('un rejeu immédiat — réponse perdue sur le réseau — n’alerte pas', ({ assert }) => {
    assert.isFalse(isRefreshReuse(rotatedAgo(5_000), NOW))
  })

  test('une session fermée par déconnexion ou par l’admin n’alerte pas', ({ assert }) => {
    const old = new Date(NOW.getTime() - 3_600_000)

    assert.isFalse(
      isRefreshReuse({ is_revoked: true, revoke_reason: 'logout', revoked_at: old }, NOW)
    )
    assert.isFalse(
      isRefreshReuse({ is_revoked: true, revoke_reason: 'admin', revoked_at: old }, NOW)
    )
  })

  test('une session inconnue ou encore active n’alerte pas', ({ assert }) => {
    assert.isFalse(isRefreshReuse(null, NOW))
    assert.isFalse(
      isRefreshReuse({ is_revoked: false, revoke_reason: null, revoked_at: null }, NOW)
    )
  })
})
