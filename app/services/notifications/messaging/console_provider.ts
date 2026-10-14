import logger from '@adonisjs/core/services/logger'
import type {
  DeliveryChannel,
  MessagingMessage,
  MessagingProvider,
} from '#services/notifications/messaging/types'

/**
 * Provider par défaut pour le développement : log dans pino.
 * Supporte SMS et WhatsApp.
 */
export class ConsoleMessagingProvider implements MessagingProvider {
  readonly name = 'console'
  readonly supports = ['sms', 'whatsapp'] as const

  async send(channel: DeliveryChannel, message: MessagingMessage): Promise<void> {
    logger.info(
      {
        provider: this.name,
        channel,
        to: message.to,
        from: message.from,
      },
      `[${channel.toUpperCase()}] → ${message.to} : ${message.text}`
    )
  }
}

export default ConsoleMessagingProvider
