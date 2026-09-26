/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'
import { TRIAL_DURATION_DAYS } from '#utils/enums/subscription_status'

import type {
  StartTrialInput,
  SubscriptionDto,
} from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Démarre un essai gratuit pour un owner qui vient d'être validé.
 *
 * Règles métier :
 *  - L'owner ne doit pas avoir de souscription "vivante" en cours.
 *  - end_date = trial_ends_at = now + 14 jours (par défaut).
 *  - plan_id = null, amount = 0, is_trial = true, status = 'trial'.
 */
export class StartTrialForOwnerUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(input: StartTrialInput): Promise<SubscriptionDto> {
    const existing = await this.repo.findCurrentByUser(input.user_id)
    if (existing) {
      throw new DomainError(
        'subscription_already_active',
        'Cet utilisateur a déjà une souscription active.',
        409
      )
    }

    // Même écriture que l'essai garanti au premier accès
    // (`ResolvePlanAccessUseCase`) : une clé par utilisateur, si bien qu'une
    // inscription et un premier appel concurrents n'ouvrent qu'un essai.
    const trial = await this.repo.startTrialOnce(
      input.user_id,
      input.duration_days ?? TRIAL_DURATION_DAYS
    )
    if (!trial) {
      throw new DomainError(
        'subscription_already_active',
        'Cet utilisateur a déjà bénéficié de son essai gratuit.',
        409
      )
    }
    return trial
  }
}

export default StartTrialForOwnerUseCase
