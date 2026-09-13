import WavePaymentService from '#services/wave_payment_service'

import type { HttpContext } from '@adonisjs/core/http'

import {
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

  async waveWebhook(ctx: HttpContext) {
    const payload = ctx.request.body() as Record<string, unknown>
    const rawBody = JSON.stringify(payload)
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
