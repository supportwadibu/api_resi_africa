import logger from '@adonisjs/core/services/logger'
import {
  type DeliveryChannel,
  type HostedOtpIssued,
  type HostedOtpProvider,
  type HostedOtpRequest,
  type HostedOtpVerification,
  MessagingError,
  type MessagingProvider,
} from '#services/notifications/messaging/types'

export interface DuguSenderConfig {
  /** `dsk_test_…` (sandbox, aucun envoi ni débit) ou `dsk_live_…`. */
  apiKey: string
  /** Requis seulement si l'Application DUGU a plusieurs projets accordés. */
  projectId?: string
  baseUrl?: string
  /** Injecté par les tests ; `fetch` global sinon. */
  fetchFn?: typeof fetch
}

/**
 * L'OTP part pendant la requête d'inscription : sans borne, un fournisseur qui
 * ne répond pas laisserait l'application mobile en attente indéfinie.
 */
const REQUEST_TIMEOUT_MS = 10_000

/** Valeurs documentées de DUGU, reprises si une réponse les omet. */
const DUGU_OTP_TTL_SECONDS = 300
const DUGU_OTP_MAX_ATTEMPTS = 5

/**
 * Refus de destination : le pays n'est pas reconnu, pas tarifé ou exclu. DUGU
 * n'envoie ni ne débite ; un nouvel essai sur le même numéro échouerait pareil.
 */
const UNSUPPORTED_DESTINATION_CODES = new Set([
  'destination_country_unresolved',
  'pricing_not_configured',
  'destination_not_permitted',
])

/** Refus de vérification qui disent quelque chose du code, pas une panne. */
const VERIFY_REASONS: Record<string, Exclude<HostedOtpVerification, { ok: true }>['reason']> = {
  otp_not_found: 'not_found',
  // Déjà vérifié ou invalidé par un renvoi : pour l'usager, il n'y a plus de
  // code à saisir, comme après une consommation locale.
  otp_not_pending: 'not_found',
  otp_expired: 'expired',
  invalid_code: 'invalid_code',
  max_attempts_exceeded: 'max_attempts',
}

interface DuguErrorBody {
  error?: { code?: string; message?: string }
  correlation_id?: string
}

/**
 * DUGU Sender — OTP par SMS et WhatsApp, générés et vérifiés par DUGU.
 *
 * Le WhatsApp part du numéro partagé de DUGU avec son gabarit Meta
 * d'authentification : aucun compte WhatsApp Business n'est requis, mais le
 * code ne peut être que celui de DUGU. D'où le contrat `HostedOtpProvider`
 * plutôt qu'un simple envoi de texte.
 *
 * Le SMS n'est ouvert qu'au Sénégal à ce jour ; pour la Côte d'Ivoire,
 * `MESSAGING_PREFERRED_CHANNEL=whatsapp`.
 *
 * Doc : https://dugusender.com/docs/reference — spec : /api/v1/openapi
 */
export class DuguSenderProvider implements MessagingProvider, HostedOtpProvider {
  readonly name = 'dugu_sender'
  readonly supports = ['whatsapp', 'sms'] as const
  readonly hostsOtp = true as const

  private readonly baseUrl: string
  private readonly fetchFn: typeof fetch

  constructor(private readonly config: DuguSenderConfig) {
    if (!config.apiKey) {
      throw new Error("DuguSenderProvider : 'apiKey' est requis.")
    }
    this.baseUrl = (config.baseUrl ?? 'https://dugusender.com/api/v1').replace(/\/$/, '')
    this.fetchFn = config.fetchFn ?? fetch
  }

  /**
   * DUGU interdit de lui confier un code (`otp_code` refusé dans les
   * variables) : un texte d'OTP composé par RESI n'a pas de chemin chez lui.
   * `NotificationService` passe par `requestOtp` dès que le fournisseur
   * héberge ses codes ; atteindre cette méthode est un défaut de câblage.
   */
  async send(): Promise<void> {
    throw new MessagingError(
      this.name,
      'DUGU Sender génère ses propres codes : passer par requestOtp, pas par send.'
    )
  }

  async requestOtp(request: HostedOtpRequest): Promise<HostedOtpIssued> {
    const res = await this.post('/otp/request', {
      subject: toE164(request.to),
      purpose: request.purpose,
      purpose_type: request.intent,
      channel: request.channel satisfies DeliveryChannel,
    })
    const body = await safeJson(res)

    if (!res.ok) {
      const code = errorCode(body)
      throw new MessagingError(
        this.name,
        `OTP ${request.channel} HTTP ${res.status}: ${code ?? 'sans code'}`,
        body,
        code && UNSUPPORTED_DESTINATION_CODES.has(code) ? 'destination_unsupported' : undefined
      )
    }

    const data = body?.data
    if (!data?.otp_id) {
      throw new MessagingError(this.name, 'Réponse OTP sans otp_id.', body)
    }

    const expiresAt = new Date(data.expires_at ?? '')
    logger.debug(
      { provider: this.name, channel: data.channel, status: data.status },
      'OTP DUGU demandé'
    )

    return {
      externalId: String(data.otp_id),
      expiresAt: Number.isNaN(expiresAt.getTime())
        ? new Date(Date.now() + DUGU_OTP_TTL_SECONDS * 1000)
        : expiresAt,
      maxAttempts: DUGU_OTP_MAX_ATTEMPTS,
      testCode: data.sandbox?.test_code ? String(data.sandbox.test_code) : null,
    }
  }

  async verifyOtp(externalId: string, code: string): Promise<HostedOtpVerification> {
    const res = await this.post('/otp/verify', { otp_id: externalId, code })
    if (res.ok) return { ok: true }

    const body = await safeJson(res)
    const errCode = errorCode(body)
    const reason = errCode ? VERIFY_REASONS[errCode] : undefined
    if (reason) return { ok: false, reason }

    // Clé révoquée, limite de débit, panne : rien ne dit que le code est faux.
    throw new MessagingError(
      this.name,
      `Vérification OTP HTTP ${res.status}: ${errCode ?? 'sans code'}`,
      body
    )
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': `Bearer ${this.config.apiKey}`,
          ...(this.config.projectId ? { 'x-project-id': this.config.projectId } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new MessagingError(
        this.name,
        `Appel ${path} impossible : ${(error as Error).message}`,
        error
      )
    }
  }
}

/**
 * DUGU exige le `+` de l'E.164 ; le validateur de RESI le laisse facultatif
 * (`^\+?[0-9]{7,15}$`). Un numéro sans `+` est lu comme déjà international.
 */
export function toE164(phone: string): string {
  const trimmed = phone.trim()
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

function errorCode(body: DuguErrorBody | null): string | undefined {
  return body?.error?.code
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export default DuguSenderProvider
