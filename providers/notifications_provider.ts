import NotificationService from '#services/notification_service'
import { buildMailProvider, mailSettingsFromEnv } from '#services/notifications/mail_factory'
import { UnconfiguredMailProvider } from '#services/notifications/mail_provider'
import { buildMessagingProvider } from '#services/notifications/messaging/factory'

/* eslint-disable prettier/prettier */
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Provider Adonis qui instancie les fournisseurs email (MAIL_PROVIDER) et
 * messaging (MESSAGING_PROVIDER) au boot et les injecte dans le
 * NotificationService.
 *
 * En cas d'échec (config incomplète), le messaging tombe en fallback sur
 * ConsoleMessagingProvider et l'erreur est loggée — l'app reste démarrable.
 * L'email aussi, sauf en production : voir `UnconfiguredMailProvider`.
 */
export default class NotificationsProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    const logger = await this.app.container.make('logger')

    try {
      const provider = buildMailProvider(mailSettingsFromEnv(this.app.inProduction))
      NotificationService.setMailProvider(provider)
      logger.info({ provider: provider.name }, 'Mail provider configuré')
    } catch (error) {
      if (this.app.inProduction) {
        NotificationService.setMailProvider(
          new UnconfiguredMailProvider((error as Error).message)
        )
      }
      logger.error(
        { err: error },
        this.app.inProduction
          ? 'Échec configuration mail provider — les emails OTP échoueront'
          : 'Échec configuration mail provider — fallback console'
      )
    }

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
