import {
  type DeliveryChannel,
  MessagingError,
  type MessagingMessage,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

/* eslint-disable prettier/prettier */
import logger from '@adonisjs/core/services/logger'

export interface OrangeConfig {
  /** Identifiants client OAuth2 fournis par Orange Developer. */
  clientId: string
  clientSecret: string
  /** Adresse expéditeur déclarée auprès d'Orange (ex: tel:+225XXXXXXXX). */
  senderAddress: string
  /** Sender name affiché (alphanumérique court, optionnel). */
  senderName?: string
  /** Override (par défaut prod). */
  baseUrl?: string
}

interface CachedToken {
  value: string
  expiresAt: number
}

/**
 * Orange Developer SMS API — supporte uniquement le SMS.
 *
 * Doc : https://developer.orange.com/apis/sms-ci/getting-started
 *
 * Flux :
 *  1. POST /oauth/v3/token (Basic clientId:clientSecret) → access_token
 *  2. POST /smsmessaging/v1/outbound/{senderAddress}/requests
 */
export class OrangeProvider implements MessagingProvider {
  readonly name = 'orange'
  readonly supports = ['sms'] as const

  private cachedToken: CachedToken | null = null

  constructor(private readonly config: OrangeConfig) {
    if (!config.clientId || !config.clientSecret || !config.senderAddress) {
      throw new Error(
        "OrangeProvider : 'clientId', 'clientSecret' et 'senderAddress' sont requis."
      )
    }
  }

  async send(channel: DeliveryChannel, message: MessagingMessage): Promise<void> {
    if (channel !== 'sms') {
      throw new MessagingError(this.name, `Canal non supporté: ${channel}`)
    }

    const baseUrl = this.config.baseUrl ?? 'https://api.orange.com'
    const token = await this.getAccessToken(baseUrl)
    const url = `${baseUrl}/smsmessaging/v1/outbound/${encodeURIComponent(
      this.config.senderAddress
    )}/requests`

    const recipient = message.to.startsWith('tel:') ? message.to : `tel:${message.to}`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: recipient,
          senderAddress: this.config.senderAddress,
          senderName: this.config.senderName ?? message.from,
          outboundSMSTextMessage: { message: message.text },
        },
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
    logger.debug({ provider: this.name, payload }, 'Orange SMS envoyé')
  }

  private async getAccessToken(baseUrl: string): Promise<string> {
    const now = Date.now()
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value
    }

    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    )
    const res = await fetch(`${baseUrl}/oauth/v3/token`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    const payload = await this.safeJson(res)
    if (!res.ok || !payload?.access_token) {
      throw new MessagingError(
        this.name,
        `OAuth HTTP ${res.status}: ${JSON.stringify(payload)}`,
        payload
      )
    }

    const expiresInSec = Number(payload.expires_in ?? 3600)
    this.cachedToken = {
      value: payload.access_token,
      expiresAt: now + expiresInSec * 1000,
    }
    return payload.access_token
  }

  private async safeJson(res: Response): Promise<any> {
    try {
      return await res.json()
    } catch {
      return null
    }
  }
}

export default OrangeProvider
