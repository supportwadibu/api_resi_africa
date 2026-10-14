import logger from '@adonisjs/core/services/logger'
import {
  type DeliveryChannel,
  MessagingError,
  type MessagingMessage,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

export interface InfobipConfig {
  /** Base URL spécifique à votre compte (ex: https://xxx.api.infobip.com). */
  baseUrl: string
  apiKey: string
  /** Sender ID alphanumérique pour les SMS (ex: "RESI"). */
  smsFrom?: string
  /** Numéro WhatsApp Business associé (E.164 sans +, ex: "447860099299"). */
  whatsappFrom?: string
}

/**
 * Infobip — supporte SMS et WhatsApp (Business API).
 *
 * Doc :
 *  - SMS      : https://www.infobip.com/docs/api/channels/sms/sms-messaging/send-sms-message
 *  - WhatsApp : https://www.infobip.com/docs/api/channels/whatsapp/whatsapp/send-whatsapp-text-message
 */
export class InfobipProvider implements MessagingProvider {
  readonly name = 'infobip'
  readonly supports = ['sms', 'whatsapp'] as const

  constructor(private readonly config: InfobipConfig) {
    if (!config.apiKey || !config.baseUrl) {
      throw new Error("InfobipProvider : 'apiKey' et 'baseUrl' sont requis.")
    }
  }

  async send(channel: DeliveryChannel, message: MessagingMessage): Promise<void> {
    if (channel === 'sms') return this.sendSms(message)
    if (channel === 'whatsapp') return this.sendWhatsapp(message)
    throw new MessagingError(this.name, `Canal non supporté: ${channel}`)
  }

  private async sendSms(message: MessagingMessage): Promise<void> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/sms/2/text/advanced`
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messages: [
          {
            from: message.from ?? this.config.smsFrom,
            destinations: [{ to: message.to }],
            text: message.text,
          },
        ],
      }),
    })

    const payload = await this.safeJson(res)
    if (!res.ok) {
      throw new MessagingError(
        this.name,
        `SMS HTTP ${res.status}: ${JSON.stringify(payload)}`,
        payload
      )
    }
    logger.debug({ provider: this.name, payload }, 'Infobip SMS envoyé')
  }

  private async sendWhatsapp(message: MessagingMessage): Promise<void> {
    if (!this.config.whatsappFrom) {
      throw new MessagingError(
        this.name,
        "Infobip WhatsApp : 'whatsappFrom' (numéro Business) requis."
      )
    }
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/whatsapp/1/message/text`
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        from: this.config.whatsappFrom,
        to: message.to,
        content: { text: message.text },
      }),
    })

    const payload = await this.safeJson(res)
    if (!res.ok) {
      throw new MessagingError(
        this.name,
        `WhatsApp HTTP ${res.status}: ${JSON.stringify(payload)}`,
        payload
      )
    }
    logger.debug({ provider: this.name, payload }, 'Infobip WhatsApp envoyé')
  }

  private headers() {
    return {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': `App ${this.config.apiKey}`,
    }
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}

export default InfobipProvider
