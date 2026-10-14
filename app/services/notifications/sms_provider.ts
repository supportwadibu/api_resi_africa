/* eslint-disable prettier/prettier */
/**
 * @deprecated Remplacé par MessagingProvider (SMS + WhatsApp unifié).
 * Voir `#services/notifications/messaging/types`.
 *
 * Re-export pour compatibilité d'import éventuelle. À supprimer.
 */
export {
  type DeliveryChannel,
  type MessagingMessage as SmsMessage,
  type MessagingProvider as SmsProvider,
} from '#services/notifications/messaging/types'
export {
  ConsoleMessagingProvider as ConsoleSmsProvider,
} from '#services/notifications/messaging/console_provider'
