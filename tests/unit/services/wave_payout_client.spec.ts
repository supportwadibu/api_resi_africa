import { test } from '@japa/runner'

import { resolvePayoutCredentials } from '#services/wave_payout_client'

test.group('resolvePayoutCredentials', () => {
  test('clé dédiée : elle et son propre secret', ({ assert }) => {
    assert.deepEqual(
      resolvePayoutCredentials({
        payoutKey: 'payout',
        payoutSecret: 'payout-secret',
        mainKey: 'main',
        mainSecret: 'main-secret',
      }),
      { apiKey: 'payout', signingSecret: 'payout-secret' }
    )
  })

  test('clé dédiée vide : la clé principale, avec son secret', ({ assert }) => {
    assert.deepEqual(
      resolvePayoutCredentials({ payoutKey: '', mainKey: 'main', mainSecret: 'main-secret' }),
      { apiKey: 'main', signingSecret: 'main-secret' }
    )
  })

  test('clé dédiée sans secret : jamais celui de la clé principale', ({ assert }) => {
    assert.deepEqual(
      resolvePayoutCredentials({ payoutKey: 'payout', mainKey: 'main', mainSecret: 'main-secret' }),
      { apiKey: 'payout', signingSecret: undefined }
    )
  })

  test('aucune clé : non configuré', ({ assert }) => {
    assert.isUndefined(resolvePayoutCredentials({}).apiKey)
  })
})
