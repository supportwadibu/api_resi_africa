import type { HttpContext } from '@adonisjs/core/http'

import OwnerRepository from '../../features/owners/repositories/owner_repository.ts'
import { GetCurrentSubscriptionUseCase } from '../../features/subscriptions/use_cases/index.ts'

/** Millisecondes dans une journée. */
const DAY_MS = 24 * 60 * 60 * 1000

export default class ProprioSubscriptionController {
  /**
   * GET /proprio/subscription
   *
   * État d'abonnement du propriétaire connecté : ce que l'application mobile
   * affiche à l'issue de l'inscription, puis sur son tableau de bord.
   *
   * La réponse croise deux informations que le client ne doit pas avoir à
   * recomposer lui-même — l'abonnement et le statut du dossier — car c'est leur
   * combinaison qui détermine le message à afficher : essai en cours, dossier
   * en attente, ou compte suspendu.
   */
  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id ?? ''

    // `GetCurrentSubscriptionUseCase` expire au passage les abonnements échus :
    // l'état renvoyé reste juste même si le cron n'est pas encore passé.
    //
    // Le repository est appelé directement plutôt que `FindOwnerUseCase`, qui
    // lève un 404 : ici l'absence de fiche propriétaire n'est pas une erreur,
    // elle laisse simplement le statut à `null`.
    const [subscription, owner] = await Promise.all([
      new GetCurrentSubscriptionUseCase().execute(userId),
      new OwnerRepository().findById(userId),
    ])

    const daysRemaining = subscription ? this.daysUntil(subscription.end_date) : 0

    return ctx.response.ok({
      data: {
        subscription,
        owner_status: owner?.owner_status ?? null,
        is_trial: subscription?.is_trial ?? false,
        days_remaining: daysRemaining,
        /** Le propriétaire peut-il exploiter ses annonces ? */
        can_operate: subscription !== null && owner?.owner_status !== 'suspended',
        /** Dossier déposé, en attente de décision d'un administrateur. */
        awaiting_validation: owner?.owner_status === 'pending',
        /**
         * Les pièces d'identité ont-elles été transmises ?
         *
         * C'est ce drapeau, et non `awaiting_validation`, qui décide du rappel
         * affiché après l'inscription : un compte est `pending` dès sa création,
         * bien avant que son titulaire ait quoi que ce soit à examiner.
         */
        profile_submitted: owner?.profile_submitted ?? false,
      },
    })
  }

  /**
   * Jours pleins restants avant une échéance, jamais négatif.
   *
   * Arrondi au supérieur : une échéance dans 12 heures compte comme un jour
   * restant, ce qui correspond à ce que l'utilisateur lit sur son écran.
   */
  private daysUntil(end: Date): number {
    const remaining = new Date(end).getTime() - Date.now()
    return remaining <= 0 ? 0 : Math.ceil(remaining / DAY_MS)
  }
}
