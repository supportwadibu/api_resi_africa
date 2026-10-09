import WavePaymentService from '#services/wave_payment_service'

import type { HttpContext } from '@adonisjs/core/http'

import {
  ConfirmBookingPaymentUseCase,
  HandleWaveWebhookUseCase,
  InitializeBookingPaymentUseCase,
} from '../../features/booking_payments/use_cases/index.ts'

export default class ClientBookingPaymentController {
  async initializeWave(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const result = await new InitializeBookingPaymentUseCase().execute(ctx.params.id, userId)
    return ctx.response.created(result)
  }

  async confirmWave(ctx: HttpContext) {
    const payment = await new ConfirmBookingPaymentUseCase().execute(
      ctx.params.id,
      ctx.authUser!.id
    )
    return ctx.response.ok({ data: payment })
  }

  /** Page affichée par Wave après le paiement, avant le retour dans l'app. */
  async waveReturn(ctx: HttpContext) {
    let status: string | null = null
    try {
      const payment = await new ConfirmBookingPaymentUseCase().executeForBooking(
        ctx.params.booking_id
      )
      status = payment?.status ?? null
    } catch {
      // Wave injoignable : la page reste utile, l'app confirmera au retour.
    }

    const message =
      status === 'success'
        ? 'Paiement reçu. Votre réservation est confirmée.'
        : ctx.request.input('outcome') === 'error'
          ? "Le paiement n'a pas abouti. Vous pouvez réessayer depuis l'application."
          : 'Paiement en cours de vérification.'

    return ctx.response
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>RESI — Réservation</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1 style="font-size:1.25rem">${message}</h1>` +
          `<p>Vous pouvez revenir dans l'application RESI.</p></body></html>`
      )
  }

  async waveWebhook(ctx: HttpContext) {
    const payload = ctx.request.body() as Record<string, unknown>
    // Corps brut : la signature porte sur les octets reçus, qu'une
    // re-sérialisation ne reproduit pas.
    const rawBody = ctx.request.raw() ?? JSON.stringify(payload)
    const signature = ctx.request.header('wave-signature') ?? ctx.request.header('x-wave-signature')

    if (!new WavePaymentService().verifyWebhookSignature(rawBody, signature)) {
      return ctx.response.unauthorized({
        code: 'invalid_signature',
        message: 'Signature invalide.',
      })
    }

    const payment = await new HandleWaveWebhookUseCase().execute(payload)
    return ctx.response.ok({ received: true, payment })
  }
}
