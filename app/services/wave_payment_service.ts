import crypto from 'node:crypto'

import env from '#start/env'

export interface WaveCheckoutSessionInput {
  amount: number
  currency: string
  transactionReference: string
  successUrl: string
  errorUrl: string
  metadata?: Record<string, unknown>
}

export interface WaveCheckoutSessionOutput {
  id: string
  paymentUrl: string
  raw: Record<string, unknown>
}

export class WavePaymentService {
  private baseUrl = env.get('WAVE_BASE_URL') ?? 'https://api.wave.com'
  private apiKey = env.get('WAVE_API_KEY')
  private webhookSecret = env.get('WAVE_WEBHOOK_SECRET')

  async createCheckoutSession(input: WaveCheckoutSessionInput): Promise<WaveCheckoutSessionOutput> {
    if (!this.apiKey) {
      throw new Error('wave_api_key_missing')
    }

    const response = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(input.amount),
        currency: input.currency,
        success_url: input.successUrl,
        error_url: input.errorUrl,
        client_reference: input.transactionReference,
        metadata: input.metadata ?? {},
      }),
    })

    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (!response.ok) {
      throw new Error(`wave_checkout_failed:${response.status}`)
    }

    const id = String(raw.id ?? raw.checkout_session_id ?? '')
    const paymentUrl = String(raw.wave_launch_url ?? raw.payment_url ?? raw.checkout_url ?? '')

    if (!id || !paymentUrl) {
      throw new Error('wave_invalid_checkout_response')
    }

    return { id, paymentUrl, raw }
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.webhookSecret) return true
    if (!signature) return false

    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')
    const normalizedSignature = signature.replace(/^sha256=/, '')

    if (expected.length !== normalizedSignature.length) return false

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalizedSignature))
  }
}

export default WavePaymentService
