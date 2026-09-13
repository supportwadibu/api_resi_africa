import NotificationService from '#services/notification_service'
import { buildMessagingProvider } from '#services/notifications/messaging/factory'

/* eslint-disable prettier/prettier */
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Provider Adonis qui instancie le MessagingProvider au boot
 * (selon MESSAGING_PROVIDER) et l'injecte dans le NotificationService.
 *
 * En cas d'échec (config incomplète), le service tombe en fallback sur
 * ConsoleMessagingProvider et l'erreur est loggée — l'app reste démarrable.
 */
export default class NotificationsProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const logger = await this.app.container.make('logger')
    try {
      const provider = buildMessagingProvider()
      NotificationService.setMessagingProvider(provider)
      logger.info(
        { provider: provider.name, supports: provider.supports },
        'Messaging provider configuré'
      )
    } catch (error) {
      logger.error(
        { err: error },
        'Échec configuration messaging provider — fallback console'
      )
    }
  }
}
