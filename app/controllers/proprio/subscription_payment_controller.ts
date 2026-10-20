import { subscriptionCheckoutValidator } from '#validators/subscription/subscription'

import type { HttpContext } from '@adonisjs/core/http'

import { ListAvailablePlansUseCase } from '../../features/plans/use_cases/index.ts'
import {
  ConfirmSubscriptionPaymentUseCase,
  StartSubscriptionCheckoutUseCase,
} from '../../features/subscriptions/use_cases/index.ts'

/**
 * Souscription d'un forfait par Wave.
 *
 * Ces routes restent ouvertes à un compte inactif : c'est par elles qu'il
 * redevient actif.
 */
export default class ProprioSubscriptionPaymentController {
  /** GET /proprio/plans */
  async plans(ctx: HttpContext) {
    return ctx.response.ok({ data: await new ListAvailablePlansUseCase().execute() })
  }

  /** POST /proprio/subscription/checkout */
  async checkout(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(subscriptionCheckoutValidator)
    const data = await new StartSubscriptionCheckoutUseCase().execute({
      user_id: ctx.authUser?.id ?? '',
      plan_id: payload.plan_id,
    })
    return ctx.response.created({ data })
  }

  /**
   * POST /proprio/subscription/checkout/:reference/confirm
   *
   * Appelé par le mobile au retour de Wave : l'abonnement s'ouvre sans
   * attendre un webhook retardé ou perdu.
   */
  async confirm(ctx: HttpContext) {
    const data = await new ConfirmSubscriptionPaymentUseCase().execute(
      ctx.params.reference,
      ctx.authUser?.id ?? ''
    )
    return ctx.response.ok({ data })
  }

  /**
   * GET /payments/wave/subscriptions/:reference/return
   *
   * Page où Wave renvoie le navigateur après le paiement. Publique : Wave n'y
   * transmet aucun jeton. Elle ne révèle rien — la référence est aléatoire, et
   * la réponse ne dit pas à qui appartient le paiement — et ne fait que
   * déclencher la confirmation, qui relit la session chez Wave.
   */
  async waveReturn(ctx: HttpContext) {
    let status: string | null = null
    try {
      const payment = await new ConfirmSubscriptionPaymentUseCase().executeForReference(
        ctx.params.reference
      )
      status = payment?.status ?? null
    } catch {
      // Wave injoignable : la page reste utile, l'application confirmera au
      // retour du propriétaire.
    }

    const message =
      status === 'success'
        ? 'Paiement reçu. Votre abonnement est actif.'
        : ctx.request.input('outcome') === 'error'
          ? "Le paiement n'a pas abouti. Vous pouvez réessayer depuis l'application."
          : 'Paiement en cours de vérification.'

    return ctx.response
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>RESI — Abonnement</title></head>` +
          `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center">` +
          `<h1 style="font-size:1.25rem">${message}</h1>` +
          `<p>Vous pouvez revenir dans l'application RESI.</p></body></html>`
      )
  }
}
