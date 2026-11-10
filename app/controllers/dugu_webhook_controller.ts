import logger from '@adonisjs/core/services/logger'

import {
  DUGU_DELIVERY_FAILURE_EVENTS,
  duguOtpIdOf,
  verifyDuguSignature,
} from '#services/notifications/messaging/dugu_webhook'
import env from '#start/env'

import type { HttpContext } from '@adonisjs/core/http'

/**
 * Webhook DUGU Sender, déclaré dans le Developer Portal (Applications >
 * Webhook) sur `https://api.resi.africa/webhooks/dugu`.
 *
 * RESI n'en tire aujourd'hui qu'un signal d'exploitation : la vérification
 * d'un OTP reste synchrone (`/otp/verify`), si bien qu'aucun état ne dépend
 * de ces livraisons. Un échec d'acheminement est journalisé en avertissement —
 * c'est un usager qui n'a pas reçu son code. Faute d'effet de bord, une
 * livraison reçue deux fois (DUGU le prévient) n'a pas à être dédupliquée.
 *
 * Toute livraison signée reçoit un 200, événement connu ou non : DUGU
 * désactive le webhook après 20 échecs consécutifs.
 */
export default class DuguWebhookController {
  async handle(ctx: HttpContext) {
    const payload = (ctx.request.body() ?? {}) as Record<string, unknown>
    // Corps brut : la signature porte sur les octets reçus, qu'une
    // re-sérialisation ne reproduit pas.
    const rawBody = ctx.request.raw() ?? JSON.stringify(payload)

    if (!this.verify(rawBody, ctx.request.header('x-dugu-signature'))) {
      return ctx.response.unauthorized({
        code: 'invalid_signature',
        message: 'Signature invalide.',
      })
    }

    const event = ctx.request.header('x-dugu-event') ?? 'inconnu'
    // Ni corps ni numéro dans le journal : seulement de quoi relier la
    // livraison à la demande d'OTP.
    const context = {
      provider: 'dugu_sender',
      event,
      delivery_id: ctx.request.header('x-dugu-delivery-id') ?? null,
      otp_id: duguOtpIdOf(payload),
    }

    if (DUGU_DELIVERY_FAILURE_EVENTS.has(event)) {
      logger.warn(context, 'Message DUGU non acheminé')
    } else {
      logger.info(context, 'Webhook DUGU reçu')
    }

    return ctx.response.ok({ received: true })
  }

  private verify(rawBody: string, header: string | undefined): boolean {
    const secret = env.get('DUGU_WEBHOOK_SECRET')
    if (!secret) {
      if (env.get('NODE_ENV') === 'production') {
        logger.error('DUGU_WEBHOOK_SECRET absent : webhook DUGU refusé')
        return false
      }
      logger.warn('DUGU_WEBHOOK_SECRET absent : signature DUGU non vérifiée (hors production)')
      return true
    }
    return verifyDuguSignature(secret, rawBody, header)
  }
}
