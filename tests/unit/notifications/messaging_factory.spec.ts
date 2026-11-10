import { test } from '@japa/runner'

import { ConsoleMessagingProvider } from '#services/notifications/messaging/console_provider'
import { buildMessagingProvider } from '#services/notifications/messaging/factory'
import { MessagingError } from '#services/notifications/messaging/types'
import { UnconfiguredMessagingProvider } from '#services/notifications/messaging/unconfigured_provider'

test.group('buildMessagingProvider', () => {
  test('rend la console hors production', ({ assert }) => {
    assert.instanceOf(
      buildMessagingProvider({ provider: 'console', inProduction: false }),
      ConsoleMessagingProvider
    )
  })

  test('refuse la console en production', ({ assert }) => {
    // La console « réussit » sans rien envoyer : l'inscription répondait 200
    // et l'usager attendait un code WhatsApp qui ne partait jamais.
    assert.throws(
      () => buildMessagingProvider({ provider: 'console', inProduction: true }),
      /production/
    )
  })

  test('rejette un fournisseur inconnu', ({ assert }) => {
    assert.throws(
      () => buildMessagingProvider({ provider: 'twilio', inProduction: false }),
      /inconnu/
    )
  })
})

test.group('UnconfiguredMessagingProvider', () => {
  test('fait échouer l’envoi au lieu de le simuler', async ({ assert }) => {
    const provider = new UnconfiguredMessagingProvider('DUGU_API_KEY manquante')
    await assert.rejects(
      () => provider.send('whatsapp', { to: '+2250700000000', text: '123456' }),
      /DUGU_API_KEY manquante/
    )
  })

  test('lève une MessagingError, que le dispatch convertit en otp_send_failed', async ({
    assert,
  }) => {
    const provider = new UnconfiguredMessagingProvider('raison')
    try {
      await provider.send('sms', { to: '+2250700000000', text: '123456' })
      assert.fail('l’envoi aurait dû échouer')
    } catch (error) {
      assert.instanceOf(error, MessagingError)
    }
  })
})
