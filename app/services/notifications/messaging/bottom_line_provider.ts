import {
  type DeliveryChannel,
  MessagingError,
  type MessagingMessage,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

/* eslint-disable prettier/prettier */
import logger from '@adonisjs/core/services/logger'

export interface BottomLineConfig {
  baseUrl: string
  apiKey: string
  /** Numéro WhatsApp Business expéditeur (E.164 sans le + selon le compte). */
  whatsappFrom: string
}

/**
 * Bottom Line — provider WhatsApp Business uniquement.
 *
 * NOTE : la structure exacte de l'endpoint dépend de votre contrat avec le
 * fournisseur. La plupart des BSP WhatsApp suivent un schéma proche
 * (POST {baseUrl}/messages, Bearer token, body JSON Cloud API-compatible).
 * Ajustez `endpoint` et `body` ci-dessous selon votre documentation.
 */
export class BottomLineProvider implements MessagingProvider {
  readonly name = 'bottom_line'
  readonly supports = ['whatsapp'] as const

  constructor(private readonly config: BottomLineConfig) {
    if (!config.apiKey || !config.baseUrl || !config.whatsappFrom) {
      throw new Error(
        "BottomLineProvider : 'apiKey', 'baseUrl' et 'whatsappFrom' sont requis."
      )
    }
  }

  async send(channel: DeliveryChannel, message: MessagingMessage): Promise<void> {
    if (channel !== 'whatsapp') {
      throw new MessagingError(this.name, `Canal non supporté: ${channel}`)
    }

    const endpoint = `${this.config.baseUrl.replace(/\/$/, '')}/messages`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        from: this.config.whatsappFrom,
        to: message.to,
        type: 'text',
        text: { body: message.text },
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
    logger.debug({ provider: this.name, payload }, 'BottomLine WhatsApp envoyé')
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}

export default BottomLineProvider
