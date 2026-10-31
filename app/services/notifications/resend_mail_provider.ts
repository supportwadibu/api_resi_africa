import logger from '@adonisjs/core/services/logger'
import {
  MailError,
  type MailMessage,
  type MailProvider,
} from '#services/notifications/mail_provider'

export interface ResendConfig {
  apiKey: string
  /** Expéditeur sur un domaine vérifié chez Resend : `Resi <no-reply@domaine>`. */
  from: string
  replyTo?: string
  baseUrl?: string
  /** Injecté par les tests ; `fetch` global sinon. */
  fetchFn?: typeof fetch
}

/**
 * L'OTP est envoyé pendant la requête d'inscription : sans borne, un
 * fournisseur qui ne répond pas laisserait l'application mobile en attente
 * indéfinie au lieu d'afficher `otp_send_failed`.
 */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * Resend — API HTTP, sans SDK : un seul appel suffit et le projet appelle
 * déjà ses fournisseurs (Infobip, Wave…) par `fetch`.
 *
 * Doc : https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendMailProvider implements MailProvider {
  readonly name = 'resend'

  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch

  constructor(private readonly config: ResendConfig) {
    if (!config.apiKey || !config.from) {
      throw new Error("ResendMailProvider : 'apiKey' et 'from' sont requis.")
    }
    this.baseUrl = (config.baseUrl ?? 'https://api.resend.com').replace(/\/$/, '')
    this.fetchFn = config.fetchFn ?? fetch
  }

  async send(message: MailMessage): Promise<void> {
    let res: Response
    try {
      res = await this.fetchFn(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [message.to],
          subject: message.subject,
          // Resend refuse `html` ou `text` à côté d'un template : le contenu
          // du code n'est qu'un repli, le template fait foi.
          ...(message.template
            ? { template: message.template }
            : { text: message.text, ...(message.html ? { html: message.html } : {}) }),
          ...(this.config.replyTo ? { reply_to: this.config.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new MailError(this.name, `Resend injoignable : ${(error as Error).message}`, error)
    }

    const payload = await this.safeJson(res)
    if (!res.ok) {
      // Resend répond `{ statusCode, name, message }` ; le message nomme la
      // cause (domaine non vérifié, clé révoquée…) et finit dans l'audit.
      const reason = payload?.message ?? JSON.stringify(payload)
      throw new MailError(this.name, `Resend HTTP ${res.status} : ${reason}`, payload)
    }
    logger.debug({ provider: this.name, id: payload?.id }, 'Email Resend envoyé')
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}

export default ResendMailProvider
