import { test } from '@japa/runner'

/**
 * En-têtes posés par Shield sur toute réponse : ils ne coûtent rien à une API
 * JSON et ferment la porte aux pages HTML qu'elle sert (retours Wave).
 */
test.group('En-têtes de sécurité', () => {
  test('la CSP refuse toute ressource et tout encadrement', async ({ client, assert }) => {
    const response = await client.get('/api/v1/health')
    const csp = response.header('content-security-policy') as string

    assert.include(csp, "default-src 'none'")
    assert.include(csp, "frame-ancestors 'none'")
    assert.match(csp, /script-src 'nonce-[^']+'/)
  })

  test('anti-encadrement et anti-reniflage sont posés', async ({ client, assert }) => {
    const response = await client.get('/api/v1/health')

    assert.equal(response.header('x-frame-options'), 'DENY')
    assert.equal(response.header('x-content-type-options'), 'nosniff')
  })
})
