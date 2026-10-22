import { waveTestCheckoutValidator } from '#validators/wave/wave_test'

import type { HttpContext } from '@adonisjs/core/http'

import WaveTestCheckoutUseCase from '../../features/wave_test/use_cases/wave_test_checkout.use_case.ts'

/**
 * Banc d'essai Wave, pour Postman : voir `WaveTestCheckoutUseCase`.
 */
export default class AdminWaveTestController {
  async config(ctx: HttpContext) {
    return ctx.response.ok({ data: new WaveTestCheckoutUseCase().config() })
  }

  async checkout(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(waveTestCheckoutValidator)
    const data = await new WaveTestCheckoutUseCase().start(payload)
    return ctx.response.created({ data })
  }

  async show(ctx: HttpContext) {
    const data = await new WaveTestCheckoutUseCase().status(ctx.params.id)
    return ctx.response.ok({ data })
  }

  async refund(ctx: HttpContext) {
    const data = await new WaveTestCheckoutUseCase().refund(ctx.params.id)
    return ctx.response.ok({ data })
  }

  async expire(ctx: HttpContext) {
    const data = await new WaveTestCheckoutUseCase().expire(ctx.params.id)
    return ctx.response.ok({ data })
  }

  /**
   * Page de retour de Wave après un essai. Publique : Wave y renvoie le
   * navigateur du payeur, sans jeton. Elle ne lit ni n'écrit rien — l'issue se
   * constate par `GET /admin/wave-test/checkout/:id`.
   */
  async waveReturn(ctx: HttpContext) {
    const success = ctx.request.input('outcome') === 'success'
    const message = success ? 'Paiement de test terminé.' : "Le paiement de test n'a pas abouti."

    return ctx.response
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>RESI — Essai Wave</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1 style="font-size:1.25rem">${message}</h1>` +
          `<p>Vérifiez l'état de la session dans Postman.</p></body></html>`
      )
  }
}
