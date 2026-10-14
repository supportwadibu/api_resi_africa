import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import env from '#start/env'

/**
 * Client Wave Checkout des abonnements.
 *
 * Distinct de `WavePaymentService`, qui sert les paiements de réservation : le
 * paiement Wave de l'application propriétaire ne porte que sur l'abonnement,
 * et ses règles — session relue chez Wave, webhook refusé sans secret en
 * production — ne doivent rien changer au flux des réservations.
 *
 * Voir `docs/superpowers/specs/2026-09-26-forfaits-apporteur-facture-design.md`.
 */

export interface WaveCheckoutInput {
  /** Entier : le franc CFA n'a pas de subdivision. */
  amount: number
  currency: string
  /** Référence RESI du paiement, rendue par Wave dans `client_reference`. */
  clientReference: string
  successUrl: string
  errorUrl: string
}

/**
 * Session de paiement telle que Wave la décrit. Seuls les champs lus par
 * l'application sont typés ; `amount` est une chaîne côté Wave.
 */
export interface WaveCheckoutSession {
  id: string
  amount: string
  currency: string
  /** `open`, `complete` ou `expired`. */
  checkout_status: string
  /** `processing`, `cancelled` ou `succeeded`. */
  payment_status: string
  client_reference: string | null
  transaction_id: string | null
}

/** Écart toléré entre l'horodatage signé par Wave et la réception. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/**
 * Vérifie un en-tête `Wave-Signature` (`t=<horodatage>,v1=<hmac>[,v1=…]`).
 *
 * La signature porte sur l'horodatage suivi du corps **brut** : un corps
 * re-sérialisé après analyse JSON ne reproduit pas les octets reçus, et la
 * comparaison échouerait sur un webhook authentique. Plusieurs `v1` peuvent
 * coexister pendant une rotation du secret.
 */
export function verifyWaveSignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  now: Date = new Date()
): boolean {
  if (!header) return false

  const parts = header.split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2)
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))
  if (!timestamp || signatures.length === 0) return false

  // Un webhook authentique rejoué bien plus tard reste signé : l'horodatage
  // borne sa durée de validité.
  const ageSeconds = Math.abs(now.getTime() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > WEBHOOK_TOLERANCE_SECONDS) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('hex')

  return signatures.some(
    (signature) =>
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
}

/** Identifiant de session d'un webhook Checkout (`data.id`, `cos-…`). */
export function checkoutIdOf(payload: Record<string, unknown>): string | null {
  // `data.id` et non `id` : à la racine, `id` désigne l'événement (`EV_…`).
  const data = payload.data as Record<string, unknown> | undefined
  const id = data?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export class WaveSubscriptionService {
  private baseUrl = env.get('WAVE_BASE_URL') ?? 'https://api.wave.com'
  private apiKey = env.get('WAVE_API_KEY')
  private webhookSecret = env.get('WAVE_WEBHOOK_SECRET')

  private headers(): Record<string, string> {
    if (!this.apiKey) throw new Error('wave_api_key_missing')
    return { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
  }

  async createCheckoutSession(
    input: WaveCheckoutInput
  ): Promise<{ id: string; paymentUrl: string }> {
    const response = await fetch(`${this.baseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: this.headers(),
      // Champs de l'API Checkout, et eux seuls : un champ inconnu est refusé.
      body: JSON.stringify({
        amount: String(input.amount),
        currency: input.currency,
        client_reference: input.clientReference,
        success_url: input.successUrl,
        error_url: input.errorUrl,
      }),
    })

    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(`wave_checkout_failed:${response.status}`)

    const id = typeof raw.id === 'string' ? raw.id : ''
    const paymentUrl = typeof raw.wave_launch_url === 'string' ? raw.wave_launch_url : ''
    if (!id || !paymentUrl) throw new Error('wave_invalid_checkout_response')

    return { id, paymentUrl }
  }

  /**
   * Relit une session chez Wave.
   *
   * C'est la seule source qui fasse foi sur l'issue d'un paiement : le corps
   * d'un webhook peut être forgé par quiconque connaît l'identifiant de la
   * session, et le propriétaire le connaît — il figure dans son lien de
   * paiement. `null` si Wave ne connaît pas la session.
   */
  async getCheckoutSession(id: string): Promise<WaveCheckoutSession | null> {
    const response = await fetch(`${this.baseUrl}/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    })

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`wave_checkout_lookup_failed:${response.status}`)

    const raw = (await response.json()) as Record<string, unknown>
    return {
      id: String(raw.id ?? id),
      amount: String(raw.amount ?? ''),
      currency: String(raw.currency ?? ''),
      checkout_status: String(raw.checkout_status ?? ''),
      payment_status: String(raw.payment_status ?? ''),
      client_reference: raw.client_reference ? String(raw.client_reference) : null,
      transaction_id: raw.transaction_id ? String(raw.transaction_id) : null,
    }
  }

  /**
   * Ferme une session encore ouverte, pour qu'elle ne puisse plus être payée.
   *
   * Wave refuse d'expirer une session déjà payée : l'appelant relit alors la
   * session pour constater le paiement. Renvoie `true` si la session est close.
   */
  async expireCheckoutSession(id: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/v1/checkout/sessions/${encodeURIComponent(id)}/expire`,
      { method: 'POST', headers: this.headers() }
    )
    return response.ok
  }

  /**
   * Le webhook reçu vient-il bien de Wave ?
   *
   * Sans `WAVE_WEBHOOK_SECRET`, refusé en production ; hors production
   * seulement, accepté avec un avertissement, pour tester sans secret. Le
   * webhook n'est de toute façon qu'un signal : la confirmation relit la
   * session chez Wave.
   */
  verifyWebhook(rawBody: string, header: string | undefined, now: Date = new Date()): boolean {
    if (!this.webhookSecret) {
      if (env.get('NODE_ENV') === 'production') {
        logger.error('WAVE_WEBHOOK_SECRET absent : webhook Wave refusé')
        return false
      }
      logger.warn('WAVE_WEBHOOK_SECRET absent : signature Wave non vérifiée (hors production)')
      return true
    }
    return verifyWaveSignature(this.webhookSecret, rawBody, header, now)
  }
}

export default WaveSubscriptionService
