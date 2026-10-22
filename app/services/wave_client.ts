import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import env from '#start/env'
import { DomainError } from '#utils/domain_error'

/**
 * Client de l'API Checkout de Wave, pour les réservations et les abonnements.
 *
 * Un seul client : deux copies divergeaient — l'une envoyait un champ
 * `metadata` que l'API ne connaît pas. Les champs envoyés sont ceux de la
 * documentation, et eux seuls.
 *
 * Référence : https://docs.wave.com/business#checkout-api
 */

/** Écart toléré entre l'horodatage signé et la réception d'un webhook. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

/** Délai au-delà duquel un appel à Wave est abandonné. */
const REQUEST_TIMEOUT_MS = 15_000

export interface WaveCheckoutInput {
  /** Entier : Wave refuse les décimales en XOF. */
  amount: number
  currency: string
  /** Référence RESI du paiement, rendue par Wave dans `client_reference`. */
  clientReference: string
  /** Absolues et en `https`, exigence de Wave. */
  successUrl: string
  errorUrl: string
}

/** Session de paiement telle que Wave la décrit, réduite à ce que RESI lit. */
export interface WaveCheckoutSession {
  id: string
  /** Chaîne côté Wave. */
  amount: string
  currency: string
  /** `open`, `complete` ou `expired`. */
  checkout_status: string
  /** `processing`, `cancelled` ou `succeeded`. */
  payment_status: string
  client_reference: string | null
  transaction_id: string | null
  wave_launch_url: string | null
  /** Par défaut 30 minutes après la création : au-delà, plus de paiement possible. */
  when_expires: Date | null
  /** Raison du dernier échec de paiement : `insufficient-funds`, `blocked-account`… */
  last_payment_error: { code: string; message: string } | null
}

/**
 * Erreur rendue par Wave, ou panne réseau (`status` 0).
 *
 * Le `code` de Wave est gardé : c'est lui qui dit pourquoi — `missing-signature`,
 * `ip-not-allowed`, `request-validation-error`, `checkout-refund-failed` —, là
 * où le seul statut HTTP ne disait rien.
 */
export class WaveApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null
  ) {
    super(message)
    this.name = 'WaveApiError'
  }

  /** Panne passagère, à réessayer : réseau, limite de débit, indisponibilité. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

/**
 * Lit le corps d'erreur de Wave.
 *
 * Deux formes coexistent : `{ code, message, details }` pour les erreurs de
 * l'API, `{ error: { code, message } }` pour le filtrage d'IP.
 */
export function parseWaveError(status: number, body: unknown): WaveApiError {
  const raw = (body ?? {}) as Record<string, unknown>
  const source = (raw.error && typeof raw.error === 'object' ? raw.error : raw) as Record<
    string,
    unknown
  >

  const code = typeof source.code === 'string' ? source.code : `http-${status}`
  const message = typeof source.message === 'string' ? source.message : 'Erreur Wave'
  return new WaveApiError(status, code, message, source.details ?? null)
}

/**
 * Signature d'une requête sortante : `t=<horodatage>,v1=<hmac>`.
 *
 * HMAC-SHA256 de l'horodatage suivi du corps **exact** envoyé — chaîne vide
 * pour un GET. Exigée par Wave dès que la clé a été créée avec la signature
 * des requêtes.
 */
export function signWaveRequest(secret: string, body: string, timestamp: number): string {
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}${body}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

/**
 * Vérifie un en-tête `Wave-Signature` de webhook (`t=<horodatage>,v1=<hmac>`).
 *
 * La signature porte sur l'horodatage suivi du corps **brut** : un corps
 * re-sérialisé après analyse JSON ne reproduit pas les octets reçus. Plusieurs
 * `v1` peuvent coexister pendant une rotation du secret.
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

/** Session Wave brute → forme lue par RESI. */
export function toCheckoutSession(
  raw: Record<string, unknown>,
  fallbackId = ''
): WaveCheckoutSession {
  const error = raw.last_payment_error as Record<string, unknown> | null | undefined
  const expires = typeof raw.when_expires === 'string' ? new Date(raw.when_expires) : null

  return {
    id: String(raw.id ?? fallbackId),
    amount: String(raw.amount ?? ''),
    currency: String(raw.currency ?? ''),
    checkout_status: String(raw.checkout_status ?? ''),
    payment_status: String(raw.payment_status ?? ''),
    client_reference: raw.client_reference ? String(raw.client_reference) : null,
    transaction_id: raw.transaction_id ? String(raw.transaction_id) : null,
    wave_launch_url: typeof raw.wave_launch_url === 'string' ? raw.wave_launch_url : null,
    when_expires: expires && !Number.isNaN(expires.getTime()) ? expires : null,
    last_payment_error:
      error && typeof error.code === 'string'
        ? { code: error.code, message: String(error.message ?? '') }
        : null,
  }
}

/** Une session peut-elle encore être payée à `now` ? */
export function isSessionPayable(session: WaveCheckoutSession, now: Date = new Date()): boolean {
  if (session.checkout_status !== 'open') return false
  return !session.when_expires || session.when_expires.getTime() > now.getTime()
}

/**
 * Traduit un échec Wave en erreur métier affichable.
 *
 * Le client n'a prise sur aucune de ces causes — clé, signature, IP, panne :
 * il lit « réessayez », et le `code` de Wave reste dans les journaux. Seul un
 * remboursement refusé se distingue : il ne se règle pas en réessayant.
 */
export function toPaymentDomainError(error: unknown): DomainError {
  if (error instanceof WaveApiError && error.code === 'checkout-refund-failed') {
    return new DomainError(
      'payment_refund_failed',
      'Wave a refusé le remboursement. Contactez l’équipe RESI pour le régler.',
      409
    )
  }
  return new DomainError(
    'payment_provider_unavailable',
    'Le paiement Wave est momentanément indisponible. Réessayez dans un instant.',
    502
  )
}

export class WaveClient {
  private baseUrl = env.get('WAVE_BASE_URL') ?? 'https://api.wave.com'
  private apiKey = env.get('WAVE_API_KEY')
  private signingSecret = env.get('WAVE_API_SIGNING_SECRET')
  private webhookSecret = env.get('WAVE_WEBHOOK_SECRET')

  /**
   * Crée une session de paiement.
   *
   * Si la réponse se perd — coupure, délai, erreur 5xx —, la session a pu être
   * créée quand même : elle est cherchée par `client_reference` avant de
   * conclure à l'échec. Sans cela, une nouvelle tentative ouvrait une seconde
   * session pour le même paiement.
   */
  async createCheckoutSession(input: WaveCheckoutInput): Promise<WaveCheckoutSession> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new WaveApiError(0, 'invalid-amount', `Montant invalide pour Wave : ${input.amount}`)
    }

    try {
      const raw = await this.request('POST', '/v1/checkout/sessions', {
        amount: String(input.amount),
        currency: input.currency.toUpperCase(),
        client_reference: input.clientReference,
        success_url: input.successUrl,
        error_url: input.errorUrl,
      })
      return this.requireLaunchable(toCheckoutSession(raw as Record<string, unknown>))
    } catch (error) {
      if (!(error instanceof WaveApiError) || !error.isTransient) throw error

      const recovered = await this.findByClientReference(input.clientReference).catch(() => null)
      if (recovered) return this.requireLaunchable(recovered)
      throw error
    }
  }

  /** Relit une session ; `null` si Wave ne la connaît pas. */
  async getCheckoutSession(id: string): Promise<WaveCheckoutSession | null> {
    try {
      const raw = await this.request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`)
      return toCheckoutSession(raw as Record<string, unknown>, id)
    } catch (error) {
      if (error instanceof WaveApiError && error.status === 404) return null
      throw error
    }
  }

  /** Session portant notre référence, la plus récente ; `null` si aucune. */
  async findByClientReference(reference: string): Promise<WaveCheckoutSession | null> {
    const raw = (await this.request(
      'GET',
      `/v1/checkout/sessions/search?client_reference=${encodeURIComponent(reference)}`
    )) as { result?: Record<string, unknown>[] }

    const sessions = (raw.result ?? []).map((item) => toCheckoutSession(item))
    return sessions.at(-1) ?? null
  }

  /**
   * Ferme une session ouverte, pour qu'elle ne puisse plus être payée.
   *
   * `false` si Wave refuse parce qu'elle est déjà payée ou expirée (409) ou
   * inconnue (404) : l'appelant relit alors la session pour constater l'issue.
   */
  async expireCheckoutSession(id: string): Promise<boolean> {
    try {
      await this.request('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`)
      return true
    } catch (error) {
      if (error instanceof WaveApiError && (error.status === 409 || error.status === 404)) {
        return false
      }
      throw error
    }
  }

  /**
   * Rembourse le paiement d'une session.
   *
   * Sans risque de double remboursement : Wave répond 200 sans nouvelle
   * transaction si la session l'est déjà. Lève `checkout-refund-failed` si le
   * transfert est impossible — solde RESI insuffisant, compte du client bloqué.
   */
  async refundCheckoutSession(id: string): Promise<void> {
    await this.request('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/refund`)
  }

  /**
   * Le webhook reçu vient-il bien de Wave ?
   *
   * Sans `WAVE_WEBHOOK_SECRET`, refusé en production ; accepté hors production
   * avec un avertissement, pour tester sans secret. Le webhook n'est de toute
   * façon qu'un signal : la confirmation relit la session chez Wave.
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

  /** Une session sans lien de paiement ne peut pas être proposée au client. */
  private requireLaunchable(session: WaveCheckoutSession): WaveCheckoutSession {
    if (!session.id || !session.wave_launch_url) {
      throw new WaveApiError(502, 'invalid-checkout-response', 'Session Wave sans lien de paiement')
    }
    return session
  }

  /**
   * Appel authentifié, signé si la clé l'exige.
   *
   * Le corps est sérialisé une seule fois : la signature porte sur les octets
   * envoyés, et une seconde sérialisation pourrait en différer.
   */
  private async request(method: 'GET' | 'POST', path: string, payload?: object): Promise<unknown> {
    if (!this.apiKey) {
      throw new WaveApiError(0, 'missing-api-key', 'WAVE_API_KEY absente')
    }

    const body = payload === undefined ? '' : JSON.stringify(payload)
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` }
    if (body) headers['Content-Type'] = 'application/json'
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
      logger.error({ err: error, method, path }, 'Wave injoignable')
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
      // 404 et 409 sont des réponses attendues (session inconnue, déjà close) :
      // l'appelant en décide, sans bruit dans les journaux.
      if (response.status !== 404 && response.status !== 409) {
        logger.error(
          { method, path, status: error.status, code: error.code, details: error.details },
          `Wave a refusé l'appel : ${error.message}`
        )
      }
      throw error
    }

    return parsed ?? {}
  }
}

export default WaveClient
