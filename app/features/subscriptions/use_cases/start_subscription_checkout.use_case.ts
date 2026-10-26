import crypto from 'node:crypto'

import logger from '@adonisjs/core/services/logger'

import SubscriptionCredit from '#models/subscription_credit'
import WaveClient, { toPaymentDomainError } from '#services/wave_client'
import env from '#start/env'
import { DomainError } from '#utils/domain_error'

import PlanRepository from '../../plans/repositories/plan_repository.ts'
import type { SubscriptionCheckoutDto } from '../dto/subscription_payment.dto.ts'
import SubscriptionPaymentRepository from '../repositories/subscription_payment_repository.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { usableCredit, waveFeeFor } from '../cancellation_policy.ts'
import PendingPaymentSettler from '../settle_pending_payments.ts'
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
    let upgradeFrom: string | null = null
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
      upgradeFrom = current.id
      amount = quote.amount
    }

    // Crédit bloqué d'une résiliation : déduit du prix, sans jamais le
    // ramener à zéro — Wave n'encaisse pas de montant nul. Le reste demeure
    // pour un paiement suivant. Consommé à l'activation seulement : une
    // session abandonnée ne le fait pas perdre.
    const subscriptionCredit = Math.min(
      usableCredit(await SubscriptionCredit.findByUser(input.user_id)),
      amount - 1
    )
    if (subscriptionCredit > 0) amount -= subscriptionCredit

    // Les frais Wave sont à la charge du propriétaire, annoncés avant le
    // paiement. `amount` reste le prix du forfait : remboursement et dépense
    // s'en déduisent, Wave garde ses frais.
    const waveFee = waveFeeFor(amount)

    const reference = `SUB-${input.user_id}-${crypto.randomUUID()}`
    const currency = (env.get('WAVE_CURRENCY') ?? 'XOF').toUpperCase()
    const returnUrl = `${env.get('APP_URL')}/api/v1/payments/wave/subscriptions/${reference}/return`

    let checkout
    try {
      checkout = await this.wave.createCheckoutSession({
        amount: amount + waveFee,
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
      // L'abonnement d'origine accompagne le crédit : la confirmation ne
      // l'honore que s'il est encore celui en cours (`buildPaidSubscription`).
      metadata: {
        ...(upgradeCredit === null
          ? {}
          : { upgrade_credit: upgradeCredit, upgrade_from: upgradeFrom }),
        ...(subscriptionCredit > 0 ? { subscription_credit: subscriptionCredit } : {}),
        wave_fee: waveFee,
      },
    })

    return {
      payment: SubscriptionPaymentRepository.toDto(payment),
      payment_url: paymentUrl,
    }
  }

  /**
   * Solde les paiements restés en attente avant d'en ouvrir un nouveau : voir
   * `PendingPaymentSettler`. Sans `strict` : une session que Wave refuse de
   * fermer n'empêche pas d'en ouvrir une autre.
   */
  private async settlePendingPayments(userId: string) {
    await new PendingPaymentSettler(this.paymentRepo, this.wave, this.confirmation).settle(userId)
  }
}

export default StartSubscriptionCheckoutUseCase
