import WaveSubscriptionService from '#services/wave_subscription_service'

import type { HttpContext } from '@adonisjs/core/http'

import { ConfirmBookingPaymentUseCase } from '../features/booking_payments/use_cases/index.ts'
import { extractCheckoutId } from '../features/booking_payments/wave_webhook.ts'
import { ConfirmSubscriptionPaymentUseCase } from '../features/subscriptions/use_cases/index.ts'

/**
 * Webhook Wave unique : réservations et abonnements.
 *
 * Wave génère un secret par webhook déclaré, alors que l'API n'en lit qu'un
 * (`WAVE_WEBHOOK_SECRET`) : deux URL déclarées ne pouvaient pas être vérifiées
 * toutes deux. Une seule URL est donc donnée à Wave, et la session désignée est
 * cherchée parmi les paiements de réservation puis d'abonnement — ses
 * identifiants `cos-…` ne se recoupent pas d'un flux à l'autre.
 *
 * Le corps n'est qu'un signal : chaque confirmation relit la session chez Wave.
 * Toute session, reconnue ou non, reçoit un 200, pour que Wave cesse de rejouer
 * un événement qui ne nous concerne pas.
 */
export default class WaveWebhookController {
  async handle(ctx: HttpContext) {
    const payload = ctx.request.body() as Record<string, unknown>
    // Corps brut : la signature porte sur les octets reçus, qu'une
    // re-sérialisation ne reproduit pas.
    const rawBody = ctx.request.raw() ?? JSON.stringify(payload)

    if (
      !new WaveSubscriptionService().verifyWebhook(rawBody, ctx.request.header('wave-signature'))
    ) {
      return ctx.response.unauthorized({
        code: 'invalid_signature',
        message: 'Signature invalide.',
      })
    }

    const checkoutId = extractCheckoutId(payload)
    if (!checkoutId) return ctx.response.ok({ received: true, handled: null })

    const booking = await new ConfirmBookingPaymentUseCase().executeForCheckout(checkoutId)
    if (booking) return ctx.response.ok({ received: true, handled: 'booking' })

    const subscription = await new ConfirmSubscriptionPaymentUseCase().executeForCheckout(
      checkoutId
    )
    return ctx.response.ok({ received: true, handled: subscription ? 'subscription' : null })
  }
}
