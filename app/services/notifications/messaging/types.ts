/**
 * Canaux de livraison supportés pour la messagerie téléphonique.
 */
export type DeliveryChannel = 'sms' | 'whatsapp'

export interface MessagingMessage {
  to: string
  text: string
  /** Optionnel : nom/numéro/sender ID expéditeur (selon le provider). */
  from?: string
}

/**
 * Contrat unifié pour tous les providers de messagerie (SMS et/ou WhatsApp).
 *
 * Chaque provider déclare les canaux qu'il supporte via `supports`.
 * Le NotificationService s'appuie sur cette information pour choisir
 * intelligemment le canal effectif.
 */
export interface MessagingProvider {
  /** Identifiant lisible pour les logs (ex: "africas_talking"). */
  readonly name: string

  /** Liste non vide des canaux supportés par ce provider. */
  readonly supports: readonly DeliveryChannel[]

  /**
   * Envoie un message via le canal demandé.
   * Doit lever une erreur si le canal n'est pas supporté ou si l'envoi échoue.
   */
  send(channel: DeliveryChannel, message: MessagingMessage): Promise<void>
}

/**
 * Identifiants des providers connus, pilotables via la variable
 * d'environnement MESSAGING_PROVIDER.
 */
export const MESSAGING_PROVIDERS = [
  'console',
  'africas_talking',
  'bottom_line',
  'infobip',
  'orange',
] as const

export type MessagingProviderName = (typeof MESSAGING_PROVIDERS)[number]

/**
 * Erreur dédiée aux providers de messagerie : permet de distinguer
 * un échec d'envoi externe d'une erreur applicative.
 */
export class MessagingError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'MessagingError'
  }
}
