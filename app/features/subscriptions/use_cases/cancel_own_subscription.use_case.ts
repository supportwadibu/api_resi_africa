import logger from '@adonisjs/core/services/logger'

import Expense from '#models/expense'
import Wallet from '#models/wallet'
import { DomainError } from '#utils/domain_error'

import { walletIdFor } from '../../wallets/wallet_rules.ts'
import PendingPaymentSettler from '../settle_pending_payments.ts'
import { cancellationTerms, creditExpiry } from '../cancellation_policy.ts'
import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { isLivePaid } from '../subscription_checkout.ts'

/**
 * Résiliation par le propriétaire, selon `cancellation_policy.ts`.
 *
 * - Remboursement (intégral, ou partiel pour un Pro+ en deuxième semaine) :
 *   l'abonnement s'arrête aussitôt, l'argent va sur le portefeuille général —
 *   l'abonnement n'est rattaché à aucune résidence — et la part retenue sur
 *   le crédit bloqué. Wave ne sait rembourser une session qu'en entier : le
 *   portefeuille est la seule voie qui rende un montant partiel tout de suite.
 *   Le compte passe à RESI Basic.
 * - Sans remboursement : l'abonnement court jusqu'à son échéance.
 *
 * Distinct de `CancelSubscriptionUseCase`, l'annulation administrative, qui
 * ne rembourse rien.
 */
export class CancelOwnSubscriptionUseCase {
  constructor(
    private subscriptionRepo: SubscriptionRepository = new SubscriptionRepository(),
    private settler: PendingPaymentSettler = new PendingPaymentSettler()
  ) {}

  async execute(userId: string, now: Date = new Date()): Promise<SubscriptionDto> {
    // Avant tout remboursement : aucune session Wave ne doit rester payable.
    // Une montée chiffrée sur l'abonnement en cours, payée après son
    // remboursement, le ferait toucher deux fois. Un paiement déjà réglé est
    // constaté, et la résiliation refusée : l'abonnement a changé.
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
    if (current.cancel_at_period_end) {
      throw new DomainError(
        'subscription_already_cancelled',
        'Cet abonnement est déjà résilié : il prendra fin à son échéance.',
        409
      )
    }

    const terms = cancellationTerms(current, now)

    if (!terms.immediate) {
      const scheduled = await this.subscriptionRepo.scheduleCancellation(
        current.id,
        'owner_cancelled'
      )
      return scheduled ?? { ...current, cancel_at_period_end: true }
    }

    const cancelled = await Wallet.cancelSubscriptionWithRefund({
      wallet_id: walletIdFor(userId, null),
      owner_id: userId,
      subscription_id: current.id,
      refund: terms.refund,
      credit: terms.credit > 0 ? { amount: terms.credit, expires_at: creditExpiry(now) } : null,
      reason: 'owner_cancelled',
    })
    if (!cancelled) {
      throw new DomainError('subscription_not_active', "L'abonnement n'est plus actif.", 409)
    }

    await this.reduceSubscriptionExpense(userId, current, terms.refund)

    const updated = await this.subscriptionRepo.findById(current.id)
    return (
      updated ?? {
        ...current,
        status: 'cancelled',
        refunded_amount: terms.refund,
        retained_credit: terms.credit,
      }
    )
  }

  /**
   * Ramène la dépense d'abonnement à ce qu'il a réellement coûté.
   *
   * Seul le remboursement en espèces la réduit : le crédit retenu reste
   * dépensé tant qu'il n'a pas servi. Réduite plutôt que contrebalancée par
   * une ligne négative : un mois qui ne porterait que le remboursement
   * afficherait une catégorie négative dans l'anneau de répartition. Bornée
   * à zéro.
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
