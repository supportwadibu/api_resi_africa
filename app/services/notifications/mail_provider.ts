import logger from '@adonisjs/core/services/logger'

/**
 * Template hébergé chez le fournisseur (Resend : identifiant ou alias d'un
 * template publié). Les clés de `variables` doivent correspondre exactement
 * à celles déclarées dans le template.
 */
export interface MailTemplate {
  id: string
  variables: Record<string, string | number>
}

export interface MailMessage {
  to: string
  subject: string
  /**
   * Contenu propre au code. Quand `template` est fourni, il ne sert plus que
   * de repli aux fournisseurs sans templates (console en développement).
   */
  text: string
  html?: string
  template?: MailTemplate
}

/**
 * Contrat à implémenter pour brancher un service email. Le fournisseur
 * effectif est choisi au démarrage par `buildMailProvider` (MAIL_PROVIDER).
 * `send` doit lever si l'envoi échoue : c'est ce qui fait remonter
 * `otp_send_failed` au lieu d'un succès sans email.
 */
export interface MailProvider {
  /** Identifiant lisible pour les logs (ex: "resend"). */
  readonly name: string
  send(message: MailMessage): Promise<void>
}

/**
 * Erreur dédiée aux fournisseurs email : distingue un échec d'envoi externe
 * d'une erreur applicative.
 */
export class MailError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'MailError'
  }
}

/**
 * Développement : journalise le message sans l'envoyer. Jamais retenu en
 * production — voir `buildMailProvider`.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console'

  async send(message: MailMessage): Promise<void> {
    logger.info(
      {
        provider: this.name,
        to: message.to,
        subject: message.subject,
        template: message.template,
      },
      `[MAIL] → ${message.to} : ${message.subject}\n${message.text}`
    )
  }
}

/**
 * Posé en production quand la configuration email est absente ou invalide.
 * Le fournisseur console « réussissait » sans rien envoyer : l'inscription
 * répondait 200 et l'utilisateur attendait un code qui ne partait jamais.
 * Lever ici rend la panne visible (`otp_send_failed`) sans empêcher le
 * démarrage des parcours qui n'envoient pas d'email.
 */
export class UnconfiguredMailProvider implements MailProvider {
  readonly name = 'unconfigured'

  constructor(private readonly reason: string) {}

  async send(): Promise<void> {
    throw new MailError(this.name, `Envoi d'email non configuré : ${this.reason}`)
  }
}

export default ConsoleMailProvider
