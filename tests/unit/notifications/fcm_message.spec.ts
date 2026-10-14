import { test } from '@japa/runner'

import { buildFcmMessage, RESI_ANDROID_CHANNEL } from '#services/push/fcm_transport'

test.group('buildFcmMessage', () => {
  const message = buildFcmMessage(['t1', 't2'], {
    title: 'Votre abonnement expire demain',
    body: 'Renouvelez-le',
    data: { type: 'subscription_expiry' },
  })

  test('vise le canal Android à importance haute créé par l’application', ({ assert }) => {
    // Sans canal nommé, Android range la notification dans le canal de secours
    // de FCM, d'importance normale : ni bannière ni son, rien qui se remarque.
    assert.equal(message.android?.notification?.channelId, RESI_ANDROID_CHANNEL)
    assert.equal(RESI_ANDROID_CHANNEL, 'resi_default')
  })

  test('réveille l’appareil', ({ assert }) => {
    assert.equal(message.android?.priority, 'high')
  })

  test('porte le titre, le corps, les données et les jetons', ({ assert }) => {
    assert.deepEqual(message.tokens, ['t1', 't2'])
    assert.equal(message.notification?.title, 'Votre abonnement expire demain')
    assert.equal(message.notification?.body, 'Renouvelez-le')
    assert.deepEqual(message.data, { type: 'subscription_expiry' })
  })
})
