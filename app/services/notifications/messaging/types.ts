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
  'dugu_sender',
] as const

export type MessagingProviderName = (typeof MESSAGING_PROVIDERS)[number]

/**
 * Cause d'échec qui appelle une autre réponse qu'une panne : un numéro que le
 * fournisseur ne dessert pas ne passera pas mieux au prochain essai, l'usager
 * doit changer de numéro ou de canal.
 */
export type MessagingFailureKind = 'destination_unsupported'

/**
 * Erreur dédiée aux providers de messagerie : permet de distinguer
 * un échec d'envoi externe d'une erreur applicative.
 */
export class MessagingError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
    public readonly kind?: MessagingFailureKind
  ) {
    super(message)
    this.name = 'MessagingError'
  }
}

/** Issue d'une vérification confiée au fournisseur. */
export type HostedOtpVerification =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'expired' | 'max_attempts' | 'invalid_code' }

export interface HostedOtpRequest {
  /** Numéro E.164. */
  to: string
  channel: DeliveryChannel
  purpose: string
  /** L'OTP prouve-t-il la possession du numéro (inscription) ou authentifie-t-il un compte connu ? */
  intent: 'verification_phone' | 'security'
}

export interface HostedOtpIssued {
  /** Identifiant du code chez le fournisseur, présenté à la vérification. */
  externalId: string
  expiresAt: Date
  maxAttempts: number
  /** Code en clair, rendu par un environnement de test seulement. */
  testCode: string | null
}

/**
 * Fournisseur qui génère et vérifie lui-même le code.
 *
 * Certains fournisseurs (DUGU Sender) n'acceptent pas qu'on leur confie un
 * code : leur gabarit WhatsApp d'authentification ne transporte que le leur.
 * RESI ne garde alors que l'identifiant du code et délègue la comparaison.
 */
export interface HostedOtpProvider {
  readonly hostsOtp: true
  requestOtp(request: HostedOtpRequest): Promise<HostedOtpIssued>
  verifyOtp(externalId: string, code: string): Promise<HostedOtpVerification>
}

export function isHostedOtpProvider(
  provider: MessagingProvider
): provider is MessagingProvider & HostedOtpProvider {
  return (provider as Partial<HostedOtpProvider>).hostsOtp === true
}
