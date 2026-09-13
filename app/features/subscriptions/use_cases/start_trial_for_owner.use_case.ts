/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'
import {
  SubscriptionStatusEnum,
  TRIAL_DURATION_DAYS,
} from '#utils/enums/subscription_status'

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

    const days = input.duration_days ?? TRIAL_DURATION_DAYS
    const now = new Date()
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    return this.repo.create({
      user_id: input.user_id,
      plan_id: null,
      is_trial: true,
      status: SubscriptionStatusEnum.TRIAL,
      amount: 0,
      start_date: now,
      end_date: end,
      trial_ends_at: end,
      auto_renew: false,
    })
  }
}

export default StartTrialForOwnerUseCase
