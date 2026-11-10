import {
  type DeliveryChannel,
  type MessagingMessage,
  MessagingError,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

/**
 * Posé en production quand la messagerie téléphonique est absente ou mal
 * configurée. Le repli sur la console « réussissait » sans rien envoyer :
 * l'inscription par téléphone répondait 200, l'application ouvrait la saisie
 * du code, et l'usager attendait un WhatsApp qui ne partait jamais — le code
 * ne figurait que dans les journaux du serveur. Lever ici rend la panne
 * visible (`otp_send_failed`) sans empêcher le démarrage des parcours qui
 * n'envoient rien par téléphone.
 */
export class UnconfiguredMessagingProvider implements MessagingProvider {
  readonly name = 'unconfigured'
  // Déclarés pour que `resolvePhoneChannel` aboutisse et que l'échec vienne
  // de `send`, porteur de la raison, plutôt que d'un « aucun canal supporté ».
  readonly supports = ['sms', 'whatsapp'] as const

  constructor(private readonly reason: string) {}

  async send(_channel: DeliveryChannel, _message: MessagingMessage): Promise<void> {
    throw new MessagingError(this.name, `Messagerie téléphonique non configurée : ${this.reason}`)
  }
}

export default UnconfiguredMessagingProvider
