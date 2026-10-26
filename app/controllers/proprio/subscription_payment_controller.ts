import { subscriptionCheckoutValidator } from '#validators/subscription/subscription'
import env from '#start/env'

import type { HttpContext } from '@adonisjs/core/http'

import { ListAvailablePlansUseCase } from '../../features/plans/use_cases/index.ts'
import SubscriptionRepository from '../../features/subscriptions/repositories/subscription_repository.ts'
import { subscriptionReturnPage } from '../../features/subscriptions/return_page.ts'
import {
  CancelOwnSubscriptionUseCase,
  ConfirmSubscriptionPaymentUseCase,
  GetSubscriptionOptionsUseCase,
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
   * GET /proprio/subscription/options
   *
   * Renouvellement ouvert ou non, remboursement d'une résiliation, prix des
   * montées de forfait : ce que l'écran des forfaits annonce avant d'agir.
   */
  async options(ctx: HttpContext) {
    const data = await new GetSubscriptionOptionsUseCase().execute(ctx.authUser?.id ?? '')
    return ctx.response.ok({ data })
  }

  /**
   * POST /proprio/subscription/cancel
   *
   * Résilie le forfait payant en cours selon `cancellation_policy.ts` :
   * remboursement au portefeuille RESI, crédit bloqué, ou fin à l'échéance.
   */
  async cancel(ctx: HttpContext) {
    const data = await new CancelOwnSubscriptionUseCase().execute(ctx.authUser?.id ?? '')
    return ctx.response.ok({ data })
  }

  /**
   * GET /payments/wave/subscriptions/:reference/return
   *
   * Page où Wave renvoie le navigateur après le paiement. Publique : Wave n'y
   * transmet aucun jeton. Elle ne révèle rien — la référence est aléatoire, et
   * la réponse ne dit pas à qui appartient le paiement — et ne fait que
   * déclencher la confirmation, qui relit la session chez Wave.
   *
   * La confirmation reste ici, côté serveur, et non sur le site : c'est elle
   * qui ouvre l'abonnement quand le webhook tarde ou se perd. Le propriétaire
   * est ensuite redirigé vers la page du site (`SITE_URL`), qui l'invite à
   * revenir dans l'application. Sans site configuré, une page qui rouvre
   * l'application elle-même (`subscriptionReturnPage`).
   */
  async waveReturn(ctx: HttpContext) {
    let status: string | null = null
    let subscriptionId: string | null = null
    try {
      const payment = await new ConfirmSubscriptionPaymentUseCase().executeForReference(
        ctx.params.reference
      )
      status = payment?.status ?? null
      subscriptionId = payment?.subscription_id ?? null
    } catch {
      // Wave injoignable : la page reste utile, l'application confirmera au
      // retour du propriétaire.
    }

    const succeeded = status === 'success'
    const failed = !succeeded && ctx.request.input('outcome') === 'error'

    const siteUrl = env.get('SITE_URL')
    if (siteUrl) {
      return ctx.response.redirect(await this.siteReturnUrl(siteUrl, failed, subscriptionId))
    }

    return ctx.response
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(subscriptionReturnPage(succeeded ? 'success' : failed ? 'failure' : 'pending'))
  }

  /**
   * Page de retour du site, avec de quoi l'annoncer.
   *
   * Un paiement encore en vérification mène à la page de succès sans forfait :
   * Wave n'y renvoie qu'après un paiement réussi, et l'application confirmera
   * au retour. Seul un échec déclaré par Wave mène à la page d'échec.
   *
   * Forfait et échéance passent en clair : ils ne disent rien de plus que ce
   * que le propriétaire vient de payer, et la référence n'est pas transmise.
   */
  private async siteReturnUrl(
    siteUrl: string,
    failed: boolean,
    subscriptionId: string | null
  ): Promise<string> {
    const base = siteUrl.replace(/\/+$/, '')
    if (failed) return `${base}/fr/paiement/echec`

    const params = new URLSearchParams()
    if (subscriptionId) {
      const subscription = await new SubscriptionRepository().findById(subscriptionId)
      if (subscription) {
        params.set('forfait', subscription.plan_tier)
        params.set('jusqu', subscription.end_date.toISOString().slice(0, 10))
      }
    }
    const query = params.toString()
    return `${base}/fr/paiement/succes${query ? `?${query}` : ''}`
  }
}
