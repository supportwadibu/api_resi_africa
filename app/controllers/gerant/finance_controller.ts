import { financeOverviewValidator } from '#validators/finance/finance'

import type { HttpContext } from '@adonisjs/core/http'

import GetFinanceOverviewUseCase from '../../features/finance/use_cases/get_finance_overview.use_case.ts'

/**
 * Relevé du gérant : le **brut** de son périmètre, jamais le net.
 *
 * `executeForManager` rend un `ManagerOverviewDto`, qui ne porte aucun champ de
 * revenu net — une méthode distincte plutôt qu'un champ conditionnel sur le
 * relevé du propriétaire, si bien qu'aucun oubli d'appelant ne peut le laisser
 * fuir. Le net déduit des charges qui ne relèvent pas du gérant : abonnement du
 * propriétaire, charges communes de la résidence, dépenses d'autres logements.
 * Calculé sur un périmètre partiel, il ne donnerait pas une marge partielle
 * mais un chiffre faux.
 *
 * `residence_id` est ignoré s'il est transmis : le périmètre d'un gérant est
 * une liste de logements, et accepter un cadrage par résidence rouvrirait la
 * porte aux logements non confiés de cette résidence.
 */
export default class GerantFinanceController {
  async overview(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(financeOverviewValidator, {
      data: ctx.request.qs(),
    })

    const range = resolveRange(payload.from?.toJSDate(), payload.to?.toJSDate())

    const overview = await new GetFinanceOverviewUseCase().executeForManager(ctx.scope, range)
    return ctx.response.ok({ data: overview })
  }
}

/**
 * Fenêtre du relevé, bornée des deux côtés.
 *
 * Le calcul du taux d'occupation rapporte les jours réservés à la capacité du
 * périmètre, et une borne manquante rendrait ce dénominateur indéfini. À
 * défaut, le mois en cours : c'est ce qu'affiche l'écran à l'ouverture.
 */
function resolveRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const now = new Date()

  return {
    from: from ?? new Date(now.getFullYear(), now.getMonth(), 1),
    to: to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}
