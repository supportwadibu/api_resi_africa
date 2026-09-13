/* eslint-disable prettier/prettier */
import type {
  OtpChannel,
  OtpPurpose,
} from '#models/otp_code'
import {
  ConsoleMailProvider,
  type MailProvider,
} from '#services/notifications/mail_provider'
import { ConsoleMessagingProvider } from '#services/notifications/messaging/console_provider'
import {
  type DeliveryChannel,
  MessagingError,
  type MessagingProvider,
} from '#services/notifications/messaging/types'
import env from '#start/env'

/**
 * Service unifié d'envoi de notifications transactionnelles (OTP, etc.).
 *
 * - canal 'email' → MailProvider
 * - canal 'phone' → MessagingProvider (SMS et/ou WhatsApp selon les capacités
 *   du provider configuré et la variable MESSAGING_PREFERRED_CHANNEL)
 *
 * Le wiring du MessagingProvider est fait au boot via la factory et un
 * provider Adonis qui appelle `setMessagingProvider`.
 */
export class NotificationService {
  private static mailProvider: MailProvider = new ConsoleMailProvider()
  private static messagingProvider: MessagingProvider = new ConsoleMessagingProvider()

  static setMailProvider(provider: MailProvider) {
    this.mailProvider = provider
  }

  static setMessagingProvider(provider: MessagingProvider) {
    this.messagingProvider = provider
  }

  static getMessagingProvider(): MessagingProvider {
    return this.messagingProvider
  }

  /**
   * Envoie un code OTP via le canal approprié.
   */
  static async sendOtp(input: {
    channel: OtpChannel
    target: string
    code: string
    purpose: OtpPurpose
    ttlMinutes?: number
  }): Promise<void> {
    const ttl = input.ttlMinutes ?? 10
    const appName = env.get('APP_NAME', 'Resi')

    if (input.channel === 'email') {
      const { subject, text, html } = this.buildEmailOtp({
        code: input.code,
        purpose: input.purpose,
        ttlMinutes: ttl,
        appName,
      })
      await this.mailProvider.send({
        to: input.target,
        subject,
        text,
        html,
      })
      return
    }

    const deliveryChannel = this.resolveDeliveryChannel()
    const text = this.buildPhoneOtp({
      code: input.code,
      purpose: input.purpose,
      ttlMinutes: ttl,
      appName,
      deliveryChannel,
    })
    await this.messagingProvider.send(deliveryChannel, {
      to: input.target,
      text,
      from: env.get('SMS_SENDER_ID', appName),
    })
  }

  /**
   * Choisit le canal de livraison effectif pour un user_channel='phone' :
   * - prend MESSAGING_PREFERRED_CHANNEL s'il est supporté par le provider
   * - sinon, prend le premier canal supporté par le provider
   * - lève si le provider ne supporte aucun canal valide
   */
  private static resolveDeliveryChannel(): DeliveryChannel {
    const preferred = (env.get('MESSAGING_PREFERRED_CHANNEL', 'sms') ?? 'sms') as DeliveryChannel
    const supports = this.messagingProvider.supports

    if (supports.includes(preferred)) return preferred
    if (supports.length > 0) return supports[0]

    throw new MessagingError(
      this.messagingProvider.name,
      'Aucun canal de livraison supporté par le provider courant.'
    )
  }

  // ------------------------------------------------------------------
  // Templates
  // ------------------------------------------------------------------

  private static buildEmailOtp(input: {
    code: string
    purpose: OtpPurpose
    ttlMinutes: number
    appName: string
  }) {
    const action = this.purposeLabel(input.purpose)
    const subject = `${input.appName} — Code de vérification : ${input.code}`

    const text =
      `Bonjour,\n\n` +
      `Voici votre code pour ${action} : ${input.code}\n` +
      `Ce code expire dans ${input.ttlMinutes} minutes.\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n` +
      `— L'équipe ${input.appName}`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="margin: 0 0 16px;">Code de vérification</h2>
        <p>Bonjour,</p>
        <p>Voici votre code pour <strong>${action}</strong> :</p>
        <p style="font-size: 32px; letter-spacing: 6px; font-weight: 700; background: #f3f4f6; padding: 16px 24px; text-align: center; border-radius: 8px;">
          ${input.code}
        </p>
        <p>Ce code expire dans <strong>${input.ttlMinutes} minutes</strong>.</p>
        <p style="color: #6b7280; font-size: 13px;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.
        </p>
        <p style="margin-top: 24px;">— L'équipe ${input.appName}</p>
      </div>
    `

    return { subject, text, html }
  }

  private static buildPhoneOtp(input: {
    code: string
    purpose: OtpPurpose
    ttlMinutes: number
    appName: string
    deliveryChannel: DeliveryChannel
  }): string {
    const action = this.purposeLabel(input.purpose)
    return (
      `${input.appName} : votre code pour ${action} est ${input.code}. ` +
      `Valable ${input.ttlMinutes} min. Ne le partagez avec personne.`
    )
  }

  private static purposeLabel(purpose: OtpPurpose): string {
    switch (purpose) {
      case 'register':
        return 'finaliser votre inscription'
      case 'login':
        return 'vous connecter'
      case 'reset':
        return 'réinitialiser votre mot de passe'
      case '2fa':
        return 'confirmer votre identité'
      default:
        return 'vérifier votre identité'
    }
  }
}

export default NotificationService
