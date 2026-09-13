/* eslint-disable @typescript-eslint/naming-convention */
import { AfricasTalkingProvider } from '#services/notifications/messaging/africas_talking_provider'
import { BottomLineProvider } from '#services/notifications/messaging/bottom_line_provider'
import { ConsoleMessagingProvider } from '#services/notifications/messaging/console_provider'
import { InfobipProvider } from '#services/notifications/messaging/infobip_provider'
import { OrangeProvider } from '#services/notifications/messaging/orange_provider'
import {
  MESSAGING_PROVIDERS,
  type MessagingProvider,
  type MessagingProviderName,
} from '#services/notifications/messaging/types'
import env from '#start/env'

import logger from '@adonisjs/core/services/logger'

/**
 * Construit le provider messaging selon la variable d'environnement
 * MESSAGING_PROVIDER. Lève si la valeur est inconnue ou si la config
 * spécifique au provider est incomplète.
 */
export function buildMessagingProvider(): MessagingProvider {
  const raw = env.get('MESSAGING_PROVIDER', 'console')
  const name = raw as MessagingProviderName

  if (!MESSAGING_PROVIDERS.includes(name)) {
    throw new Error(
      `MESSAGING_PROVIDER="${raw}" inconnu. Valeurs autorisées : ${MESSAGING_PROVIDERS.join(', ')}`
    )
  }

  switch (name) {
    case 'console':
      return new ConsoleMessagingProvider()

    case 'africas_talking':
      return new AfricasTalkingProvider({
        apiKey: requireEnv('AT_API_KEY'),
        username: requireEnv('AT_USERNAME'),
        smsFrom: env.get('AT_SMS_FROM'),
        whatsappFrom: env.get('AT_WHATSAPP_FROM'),
        baseUrl: env.get('AT_BASE_URL'),
        whatsappBaseUrl: env.get('AT_WHATSAPP_BASE_URL'),
      })

    case 'infobip':
      return new InfobipProvider({
        baseUrl: requireEnv('INFOBIP_BASE_URL'),
        apiKey: requireEnv('INFOBIP_API_KEY'),
        smsFrom: env.get('INFOBIP_SMS_FROM'),
        whatsappFrom: env.get('INFOBIP_WHATSAPP_FROM'),
      })

    case 'orange':
      return new OrangeProvider({
        clientId: requireEnv('ORANGE_CLIENT_ID'),
        clientSecret: requireEnv('ORANGE_CLIENT_SECRET'),
        senderAddress: requireEnv('ORANGE_SENDER_ADDRESS'),
        senderName: env.get('ORANGE_SENDER_NAME'),
        baseUrl: env.get('ORANGE_BASE_URL'),
      })

    case 'bottom_line':
      return new BottomLineProvider({
        baseUrl: requireEnv('BOTTOMLINE_BASE_URL'),
        apiKey: requireEnv('BOTTOMLINE_API_KEY'),
        whatsappFrom: requireEnv('BOTTOMLINE_WHATSAPP_FROM'),
      })

    default: {
      const _exhaustive: never = name
      throw new Error(`Provider non géré: ${_exhaustive as string}`)
    }
  }
}

function requireEnv(key: string): string {
  const value = env.get(key as any) as string | undefined
  if (!value) {
    logger.error({ key }, "Variable d'environnement manquante pour le provider messaging")
    throw new Error(`Variable d'environnement requise manquante : ${key}`)
  }
  return value
}
