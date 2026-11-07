import OwnerRepository from '#features/owners/repositories/owner_repository'
import PlanRepository from '#features/plans/repositories/plan_repository'
import { DomainError } from '#utils/domain_error'
import { TRIAL_DURATION_DAYS } from '#utils/enums/subscription_status'

import type { StartTrialInput, SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Ouvre l'essai gratuit sur le palier que le propriétaire a choisi.
 *
 * Aucun essai n'est plus ouvert d'office : à l'inscription, le propriétaire
 * choisit entre Pro et Pro+, et l'essai n'ouvre que ce qu'ouvre ce palier.
 *
 * Règles métier :
 *  - un seul essai par propriétaire, et jamais après un abonnement, quel
 *    qu'il soit ;
 *  - pas pour un compte rejeté ou suspendu : l'essai sert à découvrir
 *    l'application pendant l'examen du dossier, pas à contourner une
 *    décision. Un dossier en attente (`pending`) est le cas normal ;
 *  - le palier doit être vendu par au moins un plan actif : on n'essaie pas
 *    ce qu'on ne pourra pas acheter ensuite.
 */
export class StartTrialForOwnerUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private owners: OwnerRepository = new OwnerRepository(),
    private plans: PlanRepository = new PlanRepository()
  ) {}

  async execute(input: StartTrialInput): Promise<SubscriptionDto> {
    const owner = await this.owners.findById(input.user_id)
    if (!owner || owner.owner_status === 'rejected' || owner.owner_status === 'suspended') {
      throw new DomainError(
        'trial_not_allowed',
        "Votre compte ne permet pas d'ouvrir un essai gratuit.",
        403
      )
    }

    if (await this.repo.existsForUser(input.user_id)) {
      throw this.alreadyUsed()
    }

    const plans = await this.plans.listActive()
    if (!plans.some((plan) => plan.tier === input.tier)) {
      throw new DomainError(
        'plan_not_available',
        "Ce forfait n'est pas proposé pour le moment.",
        422
      )
    }

    // Une clé de document par utilisateur : deux choix envoyés en même temps
    // n'ouvrent qu'un essai.
    const trial = await this.repo.startTrialOnce(
      input.user_id,
      input.duration_days ?? TRIAL_DURATION_DAYS,
      input.tier
    )
    if (!trial) throw this.alreadyUsed()
    return trial
  }

  private alreadyUsed(): DomainError {
    return new DomainError(
      'trial_already_used',
      'Vous avez déjà bénéficié de votre essai gratuit.',
      409
    )
  }
}

export default StartTrialForOwnerUseCase
