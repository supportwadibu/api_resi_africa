import logger from '@adonisjs/core/services/logger'

import Expense from '#models/expense'
import Wallet from '#models/wallet'
import { DomainError } from '#utils/domain_error'

import { walletIdFor } from '../../wallets/wallet_rules.ts'
import PlanRepository from '../../plans/repositories/plan_repository.ts'
import PendingPaymentSettler from '../settle_pending_payments.ts'
import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { isLivePaid, unusedValue } from '../subscription_checkout.ts'

/**
 * Résiliation par le propriétaire, avec remboursement au prorata.
 *
 * Les jours payés non consommés sont rendus sur son portefeuille RESI — le
 * portefeuille général, l'abonnement n'étant rattaché à aucune résidence. Wave
 * ne sait rembourser une session qu'en entier : le portefeuille est la seule
 * voie qui rende un montant partiel tout de suite, sans traitement par
 * l'équipe. Le compte passe aussitôt à RESI Basic : sans abonnement actif,
 * `ResolvePlanAccessUseCase` rend le palier gratuit.
 *
 * Distinct de `CancelSubscriptionUseCase`, l'annulation administrative, qui
 * ne rembourse rien.
 */
export class CancelOwnSubscriptionUseCase {
  constructor(
    private subscriptionRepo: SubscriptionRepository = new SubscriptionRepository(),
    private planRepo: PlanRepository = new PlanRepository(),
    private settler: PendingPaymentSettler = new PendingPaymentSettler()
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<SubscriptionDto> {
    // Avant tout remboursement : aucune session Wave ne doit rester payable.
    // Une montée chiffrée avec le crédit des jours restants, payée après leur
    // remboursement, ferait toucher ce crédit deux fois. Un paiement déjà
    // réglé est constaté, et la résiliation refusée : l'abonnement a changé.
    await this.settler.settle(userId, { strict: true })

    await this.subscriptionRepo.expireOverdue(userId)
    const current = await this.subscriptionRepo.findCurrentByUser(userId)

    if (!current || !isLivePaid(current, now)) {
      throw new DomainError(
        'subscription_not_cancellable',
        'Aucun forfait payant en cours à résilier.',
        409
      )
    }

    const plan = current.plan_id ? await this.planRepo.findById(current.plan_id) : null
    const refund = unusedValue(current, plan?.duration_days, now)

    const cancelled = await Wallet.cancelSubscriptionWithRefund({
      wallet_id: walletIdFor(userId, null),
      owner_id: userId,
      subscription_id: current.id,
      refund,
      reason: 'owner_cancelled',
    })
    if (!cancelled) {
      throw new DomainError('subscription_not_active', "L'abonnement n'est plus actif.", 409)
    }

    await this.reduceSubscriptionExpense(userId, current, refund)

    const updated = await this.subscriptionRepo.findById(current.id)
    return updated ?? { ...current, status: 'cancelled', refunded_amount: refund }
  }

  /**
   * Ramène la dépense d'abonnement à ce qu'il a réellement coûté.
   *
   * La dépense est réduite plutôt que contrebalancée par une ligne négative :
   * un mois qui ne porterait que le remboursement afficherait une catégorie
   * négative dans l'anneau de répartition. Bornée à zéro : un renouvellement
   * reporte les jours de la période précédente, et le remboursement peut
   * dépasser le dernier paiement — l'excédent reste sur la dépense d'avant,
   * qu'on ne réécrit pas.
   *
   * Un échec est journalisé sans être propagé : la résiliation et le crédit
   * sont acquis, la dépense se corrige à la main.
   */
  private async reduceSubscriptionExpense(
    userId: string,
    subscription: SubscriptionDto,
    refund: number
  ): Promise<void> {
    if (refund <= 0 || !subscription.payment_reference) return
    try {
      const expense = await Expense.findByRequestId(
        userId,
        `subscription:${subscription.payment_reference}`
      )
      if (!expense) return

      const remaining = Math.max(0, Number(expense.amount) - refund)
      await Expense.findByIdAndUpdate(expense._id, {
        amount: remaining,
        note: `${expense.note ?? 'Abonnement'} — résilié, ${refund} F remboursés`,
      })
    } catch (error) {
      logger.error(
        { err: error, subscription: subscription.id },
        'Dépense d’abonnement non réduite après résiliation'
      )
    }
  }
}

export default CancelOwnSubscriptionUseCase
