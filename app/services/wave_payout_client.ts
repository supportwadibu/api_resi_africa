import logger from '@adonisjs/core/services/logger'

import env from '#start/env'

import { parseWaveError, signWaveRequest, WaveApiError } from './wave_client.ts'

/**
 * Client de l'API Payout de Wave : versements vers un numéro Wave, depuis le
 * compte Wave Business de RESI.
 *
 * Clé distincte de celle du Checkout (`WAVE_PAYOUT_API_KEY`) : Wave accorde
 * les API clé par clé, et une clé qui peut envoyer de l'argent ne doit pas
 * servir à autre chose.
 *
 * Référence : https://docs.wave.com/payout
 */

/** Délai au-delà duquel un appel est abandonné : son issue devient inconnue. */
const REQUEST_TIMEOUT_MS = 20_000

export interface WavePayoutInput {
  /** Entier strictement positif, net des frais : ce que reçoit le bénéficiaire. */
  receiveAmount: number
  currency: string
  /** Format international, `+225…`. */
  mobile: string
  /** Rendue par Wave, et cherchable : `GET /v1/payouts/search`. */
  clientReference: string
  /** Affiché sur le reçu du bénéficiaire, 40 caractères au plus. */
  paymentReason: string
}

/** Versement tel que Wave le décrit, réduit à ce que RESI lit. */
export interface WavePayout {
  /** Préfixe `pt-`. */
  id: string
  /** `processing`, `failed` ou `succeeded`. */
  status: string
  receive_amount: string
  fee: string | null
  mobile: string | null
  client_reference: string | null
  /** Renseigné quand `status` vaut `failed`. */
  payout_error: { code: string; message: string } | null
}

export function toWavePayout(raw: Record<string, unknown>): WavePayout {
  const error = raw.payout_error as Record<string, unknown> | null | undefined
  return {
    id: String(raw.id ?? ''),
    status: String(raw.status ?? ''),
    receive_amount: String(raw.receive_amount ?? ''),
    fee: raw.fee === undefined || raw.fee === null ? null : String(raw.fee),
    mobile: typeof raw.mobile === 'string' ? raw.mobile : null,
    client_reference: typeof raw.client_reference === 'string' ? raw.client_reference : null,
    payout_error: error
      ? {
          code: String(error.error_code ?? 'payout-failed'),
          message: String(error.error_message ?? 'Versement refusé par Wave'),
        }
      : null,
  }
}

export class WavePayoutClient {
  private baseUrl = env.get('WAVE_BASE_URL') ?? 'https://api.wave.com'
  private apiKey = env.get('WAVE_PAYOUT_API_KEY')
  private signingSecret = env.get('WAVE_PAYOUT_SIGNING_SECRET')

  /** Sans clé, le versement reste manuel : l'équipe saisit la référence. */
  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  /**
   * Envoie un versement. Synchrone chez Wave : la réponse porte déjà l'issue,
   * `processing` restant possible.
   *
   * [idempotencyKey] : la même clé ne fait jamais partir l'argent deux fois.
   * Rejouer après une réponse perdue est donc sûr, à corps identique.
   */
  async createPayout(input: WavePayoutInput, idempotencyKey: string): Promise<WavePayout> {
    if (!Number.isInteger(input.receiveAmount) || input.receiveAmount <= 0) {
      throw new WaveApiError(
        0,
        'invalid-amount',
        `Montant invalide pour Wave : ${input.receiveAmount}`
      )
    }
    const raw = await this.request(
      'POST',
      '/v1/payout',
      {
        currency: input.currency.toUpperCase(),
        receive_amount: String(input.receiveAmount),
        mobile: input.mobile,
        client_reference: input.clientReference,
        payment_reason: input.paymentReason.slice(0, 40),
      },
      idempotencyKey
    )
    return toWavePayout(raw as Record<string, unknown>)
  }

  async getPayout(id: string): Promise<WavePayout | null> {
    try {
      const raw = await this.request('GET', `/v1/payout/${encodeURIComponent(id)}`)
      return toWavePayout(raw as Record<string, unknown>)
    } catch (error) {
      if (error instanceof WaveApiError && error.status === 404) return null
      throw error
    }
  }

  async findByClientReference(reference: string): Promise<WavePayout[]> {
    const raw = (await this.request(
      'GET',
      `/v1/payouts/search?client_reference=${encodeURIComponent(reference)}`
    )) as { result?: unknown[] }
    return (raw.result ?? []).map((item) => toWavePayout(item as Record<string, unknown>))
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
    idempotencyKey?: string
  ): Promise<unknown> {
    if (!this.apiKey) {
      throw new WaveApiError(0, 'missing-api-key', 'WAVE_PAYOUT_API_KEY absente')
    }

    const body = payload === undefined ? '' : JSON.stringify(payload)
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` }
    if (body) headers['Content-Type'] = 'application/json'
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    if (this.signingSecret) {
      headers['Wave-Signature'] = signWaveRequest(
        this.signingSecret,
        body,
        Math.floor(Date.now() / 1000)
      )
    }

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body || undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      logger.error({ err: error, method, path }, 'Wave Payout injoignable')
      throw new WaveApiError(0, 'network-error', 'Wave injoignable')
    }

    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      const error = parseWaveError(response.status, parsed)
      if (response.status !== 404) {
        logger.error(
          { method, path, status: error.status, code: error.code },
          `Wave Payout a refusé l'appel : ${error.message}`
        )
      }
      throw error
    }
    return parsed ?? {}
  }
}

export default WavePayoutClient
