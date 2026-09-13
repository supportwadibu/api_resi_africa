import logger from '@adonisjs/core/services/logger'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Contrat à implémenter pour brancher un vrai service email
 * (SMTP, Mailgun, SendGrid, Brevo, SES, Resend, etc.).
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>
}

/**
 * Implémentation par défaut : log dans la console.
 * À remplacer en production par un provider réel.
 */
export class ConsoleMailProvider implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    logger.info(
      {
        provider: 'ConsoleMailProvider',
        to: message.to,
        subject: message.subject,
      },
      `[MAIL] → ${message.to} : ${message.subject}\n${message.text}`
    )
  }
}

export default ConsoleMailProvider
