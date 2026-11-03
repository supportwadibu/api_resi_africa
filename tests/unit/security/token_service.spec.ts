import { test } from '@japa/runner'
import jwt from 'jsonwebtoken'

import TokenService from '#services/token_service'
import env from '#start/env'

test.group('TokenService', () => {
  test('un access token signé se vérifie', ({ assert }) => {
    const { token, jti } = TokenService.signAccess({ sub: 'u1', role: 'proprio' })

    const payload = TokenService.verifyAccess(token)

    assert.equal(payload.sub, 'u1')
    assert.equal(payload.jti, jti)
  })

  test('un refresh token n’est jamais accepté comme access token', ({ assert }) => {
    // Même signé avec le secret d'accès — le cas de deux secrets identiques.
    const forged = jwt.sign(
      { sub: 'u1', jti: 'j1', type: 'refresh' },
      env.get('JWT_ACCESS_SECRET'),
      { expiresIn: '30d' }
    )

    assert.throws(() => TokenService.verifyAccess(forged))
  })

  test('un access token n’est jamais accepté comme refresh token', ({ assert }) => {
    const forged = jwt.sign(
      { sub: 'u1', role: 'admin', jti: 'j1' },
      env.get('JWT_REFRESH_SECRET'),
      { expiresIn: '15m' }
    )

    assert.throws(() => TokenService.verifyRefresh(forged))
  })

  test('un jeton non signé (alg « none ») est refusé', ({ assert }) => {
    const unsigned = jwt.sign({ sub: 'u1', role: 'admin', jti: 'j1' }, '', {
      algorithm: 'none',
    })

    assert.throws(() => TokenService.verifyAccess(unsigned))
  })

  test('un jeton signé avec un autre algorithme HMAC est refusé', ({ assert }) => {
    const hs512 = jwt.sign({ sub: 'u1', role: 'admin', jti: 'j1' }, env.get('JWT_ACCESS_SECRET'), {
      algorithm: 'HS512',
    })

    assert.throws(() => TokenService.verifyAccess(hs512))
  })
})
