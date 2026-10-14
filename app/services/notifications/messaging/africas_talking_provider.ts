import {
  type DeliveryChannel,
  MessagingError,
  type MessagingMessage,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

import logger from '@adonisjs/core/services/logger'

export interface AfricasTalkingConfig {
  apiKey: string
  username: string
  /** Sender ID alphanumérique pour les SMS (optionnel). */
  smsFrom?: string
  /** Numéro WhatsApp Business associé (format E.164, ex: +254711XXXYYY). */
  whatsappFrom?: string
  /** Override (utile pour la sandbox). Par défaut prod. */
  baseUrl?: string
  whatsappBaseUrl?: string
}

/**
 * Africa's Talking — supporte SMS et WhatsApp.
 *
 * Doc :
 *  - SMS      : https://developers.africastalking.com/docs/sms/sending/bulk
 *  - WhatsApp : https://developers.africastalking.com/docs/whatsapp/overview
 */
export class AfricasTalkingProvider implements MessagingProvider {
  readonly name = 'africas_talking'
  readonly supports = ['sms', 'whatsapp'] as const

  constructor(private readonly config: AfricasTalkingConfig) {
    if (!config.apiKey || !config.username) {
      throw new Error("AfricasTalkingProvider : 'apiKey' et 'username' sont requis.")
    }
  }

  async send(channel: DeliveryChannel, message: MessagingMessage): Promise<void> {
    if (channel === 'sms') return this.sendSms(message)
    if (channel === 'whatsapp') return this.sendWhatsapp(message)
    throw new MessagingError(this.name, `Canal non supporté: ${channel}`)
  }

  private async sendSms(message: MessagingMessage): Promise<void> {
    const baseUrl = this.config.baseUrl ?? 'https://api.africastalking.com'
    const body = new URLSearchParams({
      username: this.config.username,
      to: message.to,
      message: message.text,
    })
    const from = message.from ?? this.config.smsFrom
    if (from) body.set('from', from)

    const res = await fetch(`${baseUrl}/version1/messaging`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        'apiKey': this.config.apiKey,
      },
      body: body.toString(),
    })

    const payload = await this.safeJson(res)
    if (!res.ok) {
      throw new MessagingError(
        this.name,
        `SMS HTTP ${res.status}: ${JSON.stringify(payload)}`,
        payload
      )
    }

    const recipients = payload?.SMSMessageData?.Recipients ?? []
    const failed = recipients.find((r: any) => r?.statusCode && r.statusCode >= 400)
    if (failed) {
      throw new MessagingError(
        this.name,
        `SMS rejeté pour ${failed.number}: ${failed.status}`,
        payload
      )
    }
    logger.debug({ provider: this.name, recipients }, 'AT SMS envoyé')
  }

  private async sendWhatsapp(message: MessagingMessage): Promise<void> {
    if (!this.config.whatsappFrom) {
      throw new MessagingError(
        this.name,
        "Africa's Talking WhatsApp : 'whatsappFrom' (numéro Business) requis."
      )
    }
    const baseUrl = this.config.whatsappBaseUrl ?? 'https://content.africastalking.com'
    const res = await fetch(`${baseUrl}/whatsapp/message/send`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'apiKey': this.config.apiKey,
      },
      body: JSON.stringify({
        username: this.config.username,
        waNumber: this.config.whatsappFrom,
        phoneNumber: message.to,
        body: { text: message.text },
      }),
    })

    const payload = await this.safeJson(res)
    if (!res.ok || payload?.status === 'Failed') {
      throw new MessagingError(
        this.name,
        `WhatsApp HTTP ${res.status}: ${JSON.stringify(payload)}`,
        payload
      )
    }
    logger.debug({ provider: this.name, payload }, 'AT WhatsApp envoyé')
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}

export default AfricasTalkingProvider
