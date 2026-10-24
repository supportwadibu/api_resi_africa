import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import WaveClient, { toPaymentDomainError } from '#services/wave_client'
import env from '#start/env'
import { DomainError } from '#utils/domain_error'

import PlanRepository from '../../plans/repositories/plan_repository.ts'
import type { SubscriptionCheckoutDto } from '../dto/subscription_payment.dto.ts'
import SubscriptionPaymentRepository from '../repositories/subscription_payment_repository.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { checkoutRefusal, isUpgrade, upgradeQuote } from '../subscription_checkout.ts'
import ConfirmSubscriptionPaymentUseCase from './confirm_subscription_payment.use_case.ts'

/**
 * Lance le paiement Wave d'un forfait.
 *
 * L'abonnement n'est pas créé ici : il ne l'est qu'une fois le paiement
 * confirmé (`ConfirmSubscriptionPaymentUseCase`). Le plan choisi est figé sur
 * le paiement — prix, palier, durée — pour que le propriétaire reçoive ce
 * qu'il a payé, même si le plan change entre-temps.
 */
export class StartSubscriptionCheckoutUseCase {
  constructor(
    private planRepo: PlanRepository = new PlanRepository(),
    private subscriptionRepo: SubscriptionRepository = new SubscriptionRepository(),
    private paymentRepo: SubscriptionPaymentRepository = new SubscriptionPaymentRepository(),
    private wave: Pick<
      WaveClient,
      'createCheckoutSession' | 'expireCheckoutSession'
    > = new WaveClient(),
    private confirmation: ConfirmSubscriptionPaymentUseCase = new ConfirmSubscriptionPaymentUseCase()
  ) {}

  async execute(input: { user_id: string; plan_id: string }): Promise<SubscriptionCheckoutDto> {
    const plan = await this.planRepo.findById(input.plan_id)
    if (!plan) {
      throw new DomainError('plan_not_found', 'Forfait introuvable.', 404)
    }
    if (!plan.is_active) {
      throw new DomainError('plan_inactive', "Ce forfait n'est plus proposé.", 409)
    }

    await this.settlePendingPayments(input.user_id)

    await this.subscriptionRepo.expireOverdue(input.user_id)
    const current = await this.subscriptionRepo.findCurrentByUser(input.user_id)
    const refusal = checkoutRefusal(current, plan.tier)
    if (refusal) throw refusal

    // Montée de forfait : le prix est réduit de la valeur des jours restants,
    // et l'ancien abonnement sera clos sans report à la confirmation.
    let upgradeCredit: number | null = null
    // Le franc CFA n'a pas de subdivision : Wave attend un entier.
    let amount = Math.round(plan.price)
    if (current && isUpgrade(current, plan.tier)) {
      const currentPlan = current.plan_id ? await this.planRepo.findById(current.plan_id) : null
      const quote = upgradeQuote(current, currentPlan?.duration_days, plan.price)
      if (quote.amount < 1) {
        throw new DomainError(
          'upgrade_not_payable',
          'Les jours restants de votre forfait couvrent déjà ce forfait : le changement se fera à l’échéance.',
          409
        )
      }
      upgradeCredit = quote.credit
      amount = quote.amount
    }

    const reference = `SUB-${input.user_id}-${crypto.randomUUID()}`
    const currency = (env.get('WAVE_CURRENCY') ?? 'XOF').toUpperCase()
    const returnUrl = `${env.get('APP_URL')}/api/v1/payments/wave/subscriptions/${reference}/return`

    let checkout
    try {
      checkout = await this.wave.createCheckoutSession({
        amount,
        currency,
        clientReference: reference,
        successUrl: `${returnUrl}?outcome=success`,
        errorUrl: `${returnUrl}?outcome=error`,
      })
    } catch (error) {
      logger.error({ err: error, userId: input.user_id }, 'Création de la session Wave impossible')
      throw toPaymentDomainError(error)
    }

    // Garanti non nul par le client : une session sans lien est refusée.
    const paymentUrl = checkout.wave_launch_url!
    const payment = await this.paymentRepo.createPending({
      user_id: input.user_id,
      reference,
      plan_id: plan.id,
      plan_tier: plan.tier,
      duration_days: plan.duration_days,
      amount,
      currency,
      provider_checkout_id: checkout.id,
      payment_url: paymentUrl,
      metadata: upgradeCredit === null ? {} : { upgrade_credit: upgradeCredit },
    })

    return {
      payment: SubscriptionPaymentRepository.toDto(payment),
      payment_url: paymentUrl,
    }
  }

  /**
   * Solde les paiements restés en attente avant d'en ouvrir un nouveau.
   *
   * Un paiement déjà réglé chez Wave mais pas encore confirmé est d'abord
   * constaté : le propriétaire a payé, et relancer un paiement le ferait payer
   * deux fois. Les autres sessions sont fermées chez Wave, pour qu'un vieux
   * lien ne puisse plus être payé en plus du nouveau.
   */
  private async settlePendingPayments(userId: string) {
    for (const pending of await this.paymentRepo.findPendingByUser(userId)) {
      const settled = await this.confirmation.confirm(pending)
      if (settled.status === 'success') {
        throw new DomainError(
          'subscription_payment_received',
          'Votre paiement précédent vient d’être confirmé : votre abonnement est actif.',
          409
        )
      }
      if (settled.status !== 'pending' || !pending.provider_checkout_id) continue

      let expired = false
      try {
        expired = await this.wave.expireCheckoutSession(pending.provider_checkout_id)
      } catch (error) {
        throw toPaymentDomainError(error)
      }
      if (expired) {
        await this.paymentRepo.closePending(pending._id, 'expired', 'superseded')
      }
    }
  }
}

export default StartSubscriptionCheckoutUseCase
