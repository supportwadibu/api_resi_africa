import { test } from '@japa/runner'

/**
 * Hors développement, sans `CORS_ALLOWED_ORIGINS`, aucune page web ne doit
 * pouvoir lire les réponses de l'API : le préflight d'une origine étrangère
 * repart sans `Access-Control-Allow-Origin`, et le navigateur bloque l'appel.
 */
test.group('CORS', () => {
  test('le préflight d’une origine non listée est refusé', async ({ client, assert }) => {
    const response = await client
      .options('/api/v1/health')
      .header('Origin', 'https://site-malveillant.example')
      .header('Access-Control-Request-Method', 'GET')

    assert.isUndefined(response.header('access-control-allow-origin'))
  })

  test('une requête simple d’origine non listée ne reçoit pas d’autorisation', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/v1/health')
      .header('Origin', 'https://site-malveillant.example')

    assert.isUndefined(response.header('access-control-allow-origin'))
    assert.isUndefined(response.header('access-control-allow-credentials'))
  })
})
