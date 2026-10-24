import { tierAllows } from '#features/plans/plan_tier'

import PlanRepository from '../../plans/repositories/plan_repository.ts'
import type { SubscriptionOptionsDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import {
  isLivePaid,
  isRenewable,
  remainingPaidDays,
  unusedValue,
  upgradeQuote,
} from '../subscription_checkout.ts'

/**
 * Ce que le propriétaire peut faire de son forfait en cours, chiffré.
 *
 * Les montants viennent du serveur et non d'un calcul de l'application : le
 * remboursement annoncé avant de résilier est celui qui sera crédité, et le
 * prix d'une montée celui que Wave encaissera.
 */
export class GetSubscriptionOptionsUseCase {
  constructor(
    private subscriptionRepo: SubscriptionRepository = new SubscriptionRepository(),
    private planRepo: PlanRepository = new PlanRepository()
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<SubscriptionOptionsDto> {
    await this.subscriptionRepo.expireOverdue(userId)
    const current = await this.subscriptionRepo.findCurrentByUser(userId)

    if (!current || !isLivePaid(current, now)) {
      return {
        renewable: true,
        cancellable: false,
        refund_amount: 0,
        remaining_days: 0,
        upgrades: [],
      }
    }

    const [currentPlan, plans] = await Promise.all([
      current.plan_id ? this.planRepo.findById(current.plan_id) : Promise.resolve(null),
      this.planRepo.listActive(),
    ])

    const upgrades = plans
      .filter((plan) => plan.tier !== current.plan_tier && tierAllows(plan.tier, current.plan_tier))
      .map((plan) => ({
        plan_id: plan.id,
        plan_tier: plan.tier,
        price: Math.round(plan.price),
        amount: upgradeQuote(current, currentPlan?.duration_days, plan.price, now).amount,
      }))
      // Une montée que les jours restants couvrent déjà ne s'encaisse pas :
      // `StartSubscriptionCheckoutUseCase` la refuserait.
      .filter((upgrade) => upgrade.amount >= 1)

    return {
      renewable: isRenewable(current, now),
      cancellable: true,
      refund_amount: unusedValue(current, currentPlan?.duration_days, now),
      remaining_days: remainingPaidDays(current.end_date, now),
      upgrades,
    }
  }
}

export default GetSubscriptionOptionsUseCase
