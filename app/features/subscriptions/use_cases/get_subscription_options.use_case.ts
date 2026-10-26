import { tierAllows } from '#features/plans/plan_tier'
import SubscriptionCredit from '#models/subscription_credit'

import PlanRepository from '../../plans/repositories/plan_repository.ts'
import { cancellationTerms, usableCredit, WAVE_FEE_RATE } from '../cancellation_policy.ts'
import type { SubscriptionOptionsDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import {
  isLivePaid,
  isRenewable,
  remainingPaidDays,
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
    const [current, creditDoc] = await Promise.all([
      this.subscriptionRepo.findCurrentByUser(userId),
      SubscriptionCredit.findByUser(userId),
    ])

    const creditAmount = usableCredit(creditDoc, now)
    const credit =
      creditDoc && creditAmount > 0
        ? { amount: creditAmount, expires_at: creditDoc.expires_at }
        : null

    if (!current || !isLivePaid(current, now)) {
      return {
        renewable: true,
        cancellable: false,
        cancel_mode: null,
        refund_amount: 0,
        refund_credit: 0,
        access_ends_at: null,
        cancel_scheduled: false,
        remaining_days: 0,
        upgrades: [],
        credit,
        wave_fee_rate: WAVE_FEE_RATE,
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

    const scheduled = current.cancel_at_period_end
    const terms = cancellationTerms(current, now, {
      fullRefundAvailable: !creditDoc?.full_refund_used_at,
    })

    return {
      renewable: isRenewable(current, now),
      cancellable: !scheduled,
      cancel_mode: scheduled ? null : terms.mode,
      refund_amount: scheduled ? 0 : terms.refund,
      refund_credit: scheduled ? 0 : terms.credit,
      access_ends_at: terms.immediate && !scheduled ? now : current.end_date,
      cancel_scheduled: scheduled,
      remaining_days: remainingPaidDays(current.end_date, now),
      upgrades,
      credit,
      wave_fee_rate: WAVE_FEE_RATE,
    }
  }
}

export default GetSubscriptionOptionsUseCase
