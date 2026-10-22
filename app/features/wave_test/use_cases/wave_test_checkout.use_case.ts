import crypto from 'node:crypto'

import env from '#start/env'
import WaveClient, { WaveApiError, type WaveCheckoutSession } from '#services/wave_client'
import { DomainError } from '#utils/domain_error'

import type { WaveTestConfigDto, WaveTestSessionDto } from '../dto/wave_test.dto.ts'

/** Configuration lue par le banc d'essai, injectée pour rester testable sans `.env`. */
export interface WaveTestSettings {
  appUrl: string | undefined
  currency: string | undefined
  apiKey: string | undefined
  signingSecret: string | undefined
  webhookSecret: string | undefined
  baseUrl: string | undefined
}

function settingsFromEnv(): WaveTestSettings {
  return {
    appUrl: env.get('APP_URL'),
    currency: env.get('WAVE_CURRENCY'),
    apiKey: env.get('WAVE_API_KEY'),
    signingSecret: env.get('WAVE_API_SIGNING_SECRET'),
    webhookSecret: env.get('WAVE_WEBHOOK_SECRET'),
    baseUrl: env.get('WAVE_BASE_URL'),
  }
}

/**
 * Banc d'essai de l'intégration Wave, pour un administrateur muni de Postman.
 *
 * Ouvre, relit, rembourse et ferme de vraies sessions Checkout — Wave n'a pas
 * de bac à sable : l'argent bouge, d'où un montant plafonné par le validator
 * et le remboursement à portée de main. Rien n'est écrit en base : la session
 * n'appartient à aucune réservation ni à aucun abonnement, et le webhook qu'elle
 * déclenche est reconnu comme étranger et ignoré.
 *
 * Contrairement aux flux réels, une erreur Wave remonte avec son code : c'est
 * ce qu'on vient chercher ici — `missing-signature`, `ip-not-allowed`,
 * `request-validation-error` disent ce qu'il faut corriger dans la
 * configuration.
 */
export class WaveTestCheckoutUseCase {
  constructor(
    private wave: Pick<
      WaveClient,
      | 'createCheckoutSession'
      | 'getCheckoutSession'
      | 'refundCheckoutSession'
      | 'expireCheckoutSession'
    > = new WaveClient(),
    private settings: WaveTestSettings = settingsFromEnv()
  ) {}

  /** Ce qui est renseigné, sans aucune valeur secrète. */
  config(): WaveTestConfigDto {
    const appUrl = this.settings.appUrl ?? ''
    return {
      api_key: Boolean(this.settings.apiKey),
      api_signing_secret: Boolean(this.settings.signingSecret),
      webhook_secret: Boolean(this.settings.webhookSecret),
      base_url: this.settings.baseUrl ?? 'https://api.wave.com',
      currency: this.currency(),
      app_url: appUrl,
      // Wave refuse les pages de retour qui ne sont pas en https.
      app_url_is_https: appUrl.startsWith('https://'),
      webhook_url: `${appUrl}/api/v1/payments/wave/webhook`,
    }
  }

  async start(input: { amount: number }): Promise<WaveTestSessionDto> {
    const returnUrl = `${this.settings.appUrl ?? ''}/api/v1/payments/wave/test/return`
    const session = await this.call(() =>
      this.wave.createCheckoutSession({
        amount: input.amount,
        currency: this.currency(),
        // Préfixe distinct des flux réels (`BOOKING-`, abonnements) : une
        // session d'essai se reconnaît d'un coup d'œil dans le portail Wave.
        clientReference: `TEST-${crypto.randomUUID()}`,
        successUrl: `${returnUrl}?outcome=success`,
        errorUrl: `${returnUrl}?outcome=error`,
      })
    )
    return toDto(session)
  }

  async status(checkoutId: string): Promise<WaveTestSessionDto> {
    const session = await this.call(() => this.wave.getCheckoutSession(checkoutId))
    if (!session) throw new DomainError('wave_session_not_found', 'Session Wave introuvable.', 404)
    return toDto(session)
  }

  /** Rembourse puis relit : la réponse montre l'état laissé par Wave. */
  async refund(checkoutId: string): Promise<WaveTestSessionDto> {
    await this.call(() => this.wave.refundCheckoutSession(checkoutId))
    return this.status(checkoutId)
  }

  /** `expired: false` : déjà payée ou déjà close (409), ou inconnue (404). */
  async expire(checkoutId: string): Promise<{ expired: boolean }> {
    return { expired: await this.call(() => this.wave.expireCheckoutSession(checkoutId)) }
  }

  private currency(): string {
    return (this.settings.currency ?? 'XOF').toUpperCase()
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof WaveApiError) {
        throw new DomainError(
          'wave_error',
          `Wave a refusé l'appel (${error.status || 'réseau'}) : ${error.code} — ${error.message}`,
          502
        )
      }
      throw error
    }
  }
}

function toDto(session: WaveCheckoutSession): WaveTestSessionDto {
  return {
    checkout_id: session.id,
    client_reference: session.client_reference,
    amount: session.amount,
    currency: session.currency,
    checkout_status: session.checkout_status,
    payment_status: session.payment_status,
    transaction_id: session.transaction_id,
    wave_launch_url: session.wave_launch_url,
    when_expires: session.when_expires,
    last_payment_error: session.last_payment_error,
  }
}

export default WaveTestCheckoutUseCase
