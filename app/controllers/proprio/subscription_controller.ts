import type { HttpContext } from '@adonisjs/core/http'

import OwnerRepository from '../../features/owners/repositories/owner_repository.ts'
import { legacyPlanAccess } from '../../features/subscriptions/plan_access.ts'
import {
  GetCurrentSubscriptionUseCase,
  GetTrialStatusUseCase,
  ResolvePlanAccessUseCase,
  StartTrialForOwnerUseCase,
} from '../../features/subscriptions/use_cases/index.ts'
import { startTrialValidator } from '#validators/subscription/subscription'

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
    // Même décision que le middleware `plan()` : l'écran ne peut pas annoncer
    // un accès que l'API refuserait.
    const [planAccess, subscription, owner] = await Promise.all([
      new ResolvePlanAccessUseCase().execute(userId),
      new GetCurrentSubscriptionUseCase().execute(userId),
      new OwnerRepository().findById(userId),
    ])
    const trial = await new GetTrialStatusUseCase().execute(userId, owner?.owner_status ?? null)

    const daysRemaining = subscription ? this.daysUntil(subscription.end_date) : 0

    return ctx.response.ok({
      data: {
        subscription,
        owner_status: owner?.owner_status ?? null,
        is_trial: subscription?.is_trial ?? false,
        days_remaining: daysRemaining,
        /** Le propriétaire peut-il exploiter ses annonces ? */
        can_operate: planAccess !== null && owner?.owner_status !== 'suspended',
        /**
         * Palier ouvert, dans le vocabulaire des applications déjà installées :
         * `full`, `basic`, ou `null` pour un compte inactif. Elles ne
         * connaissent pas les paliers actuels, et liraient `pro_plus` comme un
         * compte inactif — tous leurs utilisateurs seraient bloqués. RESI Basic
         * y devient `basic` : l'API refuse ce qu'il n'ouvre pas, et l'ancienne
         * application suit ses refus.
         */
        plan_access: legacyPlanAccess(planAccess),
        /** Palier ouvert : `free`, `pro`, `pro_plus`, ou `null` pour un compte inactif. */
        plan_tier: planAccess,
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
        /**
         * Rien essayé ni souscrit : l'application retient le propriétaire sur
         * l'écran de choix du palier d'essai.
         */
        trial_choice_required: trial.trial_choice_required,
        /** Palier de l'essai terminé, sans abonnement depuis ; `null` sinon. */
        ended_trial_tier: trial.ended_trial_tier,
      },
    })
  }

  /**
   * POST /proprio/subscription/trial
   *
   * Ouvre l'essai gratuit sur le palier choisi (`pro` ou `pro_plus`).
   */
  async startTrial(ctx: HttpContext) {
    const { tier } = await ctx.request.validateUsing(startTrialValidator)
    const subscription = await new StartTrialForOwnerUseCase().execute({
      user_id: ctx.authUser?.id ?? '',
      tier,
    })
    return ctx.response.created({ data: subscription })
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
