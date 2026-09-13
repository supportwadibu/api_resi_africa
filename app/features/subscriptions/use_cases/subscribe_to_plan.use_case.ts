/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'
import { SubscriptionStatusEnum } from '#utils/enums/subscription_status'

import PlanRepository from '../../plans/repositories/plan_repository.ts'
import type {
  SubscribeToPlanInput,
  SubscriptionDto,
} from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Souscrit un owner à un plan payant.
 *
 * Règles métier :
 *  - Le plan doit exister et être actif.
 *  - Si l'owner a un trial en cours → on le clôt (cancelled) puis on crée
 *    la nouvelle souscription active.
 *  - Si l'owner a déjà une souscription active payante → erreur 409
 *    (il faut d'abord annuler ou attendre l'expiration).
 *  - end_date = now + plan.duration_days.
 */
export class SubscribeToPlanUseCase {
  constructor(
    private subscriptionRepo: SubscriptionRepository = new SubscriptionRepository(),
    private planRepo: PlanRepository = new PlanRepository()
  ) {}

  async execute(input: SubscribeToPlanInput): Promise<SubscriptionDto> {
    const plan = await this.planRepo.findById(input.plan_id)
    if (!plan) {
      throw new DomainError('plan_not_found', 'Plan introuvable.', 404)
    }
    if (!plan.is_active) {
      throw new DomainError(
        'plan_inactive',
        "Ce plan n'est plus disponible à la souscription.",
        409
      )
    }

    // Expire passivement toute souscription dont end_date est dépassée.
    await this.subscriptionRepo.expireOverdue(input.user_id)

    const current = await this.subscriptionRepo.findCurrentByUser(input.user_id)
    if (current) {
      if (current.is_trial) {
        // Trial en cours : on le clôt pour permettre la nouvelle souscription.
        await this.subscriptionRepo.updateStatus(current.id, SubscriptionStatusEnum.CANCELLED, {
          cancel_reason: 'upgraded_to_plan',
        })
      } else {
        throw new DomainError(
          'subscription_already_active',
          'Une souscription payante est déjà active. Annulez-la ou attendez son expiration.',
          409
        )
      }
    }

    const now = new Date()
    const end = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000)

    return this.subscriptionRepo.create({
      user_id: input.user_id,
      plan_id: plan.id,
      is_trial: false,
      status: SubscriptionStatusEnum.ACTIVE,
      amount: plan.price,
      start_date: now,
      end_date: end,
      trial_ends_at: null,
      payment_reference: input.payment_reference ?? null,
      auto_renew: input.auto_renew ?? false,
    })
  }
}

export default SubscribeToPlanUseCase
