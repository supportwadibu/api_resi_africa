import crypto from 'node:crypto'

import OwnerRepository from '#features/owners/repositories/owner_repository'
import PlanRepository from '#features/plans/repositories/plan_repository'
import { planTierLabel } from '#features/plans/plan_tier'
import Expense from '#models/expense'
import OtpCode from '#models/otp_code'
import OtpService from '#services/otp_service'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { grantContext, planGrant, type ManualPaymentMethod } from '../subscription_grant.ts'
import { loadGrantTargets } from './request_subscription_grant_code.use_case.ts'

export interface GrantSubscriptionInput {
  admin_id: string
  user_id: string
  plan_id: string
  /** Montant reçu hors application ; le prix du plan à défaut. */
  amount?: number
  payment_method?: ManualPaymentMethod
  payment_reference?: string
  note?: string
  /** Code reçu sur l'e-mail de l'administrateur (`RequestSubscriptionGrantCodeUseCase`). */
  code: string
}

/**
 * Seconde étape : enregistre l'abonnement d'un propriétaire sur décision d'un
 * administrateur, sans passer par Wave — paiement reçu en espèces ou par un
 * autre canal, geste commercial, compte de démonstration.
 *
 * Le code doit avoir été demandé par cet administrateur, pour ce propriétaire,
 * ce forfait et ce montant. Il est lu avant d'être consommé : un code demandé
 * pour un autre choix se refuse sans brûler d'essai.
 *
 * Le montant est enregistré comme un paiement : abonnement, historique des
 * paiements (revenu de RESI) et dépense du propriétaire. La qualification de
 * parrainage, elle, reste aux paiements Wave : elle verse une prime, et un
 * montant déclaré à la main ne prouve pas l'encaissement.
 */
export class GrantSubscriptionUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private owners: Pick<OwnerRepository, 'findById'> = new OwnerRepository(),
    private plans: Pick<PlanRepository, 'findById'> = new PlanRepository()
  ) {}

  async execute(input: GrantSubscriptionInput): Promise<SubscriptionDto> {
    const { plan, amount } = await loadGrantTargets(this.owners, this.plans, input)
    await this.verifyCode(input, amount)

    const reference = `MAN-${input.user_id}-${crypto.randomUUID()}`
    const { subscription, closed } = await this.repo.grant(input.user_id, (live) =>
      planGrant(
        {
          user_id: input.user_id,
          plan_id: plan.id,
          plan_tier: plan.tier,
          duration_days: plan.duration_days,
          amount,
          payment_method: input.payment_method ?? 'cash',
          external_reference: input.payment_reference?.trim() || null,
          transaction_reference: reference,
          admin_id: input.admin_id,
          note: input.note?.trim() || null,
        },
        live
      )
    )

    if (amount > 0) {
      // Même ligne que pour un paiement Wave : l'abonnement est un coût
      // plateforme du propriétaire, non imputable à un bien.
      await Expense.createOnce({
        owner_id: input.user_id,
        property_id: null,
        residence_id: null,
        category: 'subscription',
        amount,
        spent_at: subscription.start_date,
        note: `Abonnement ${planTierLabel(plan.tier)}`,
        client_request_id: `subscription:${reference}`,
      })
    }

    await this.repo.recordEvent({
      user_id: input.user_id,
      subscription_id: subscription.id,
      event_type: 'granted',
      description: `Enregistré par un administrateur, hors application (${plan.name}, ${amount} F).`,
      previous_status: null,
      new_status: subscription.status,
      metadata: {
        plan_id: plan.id,
        duration_days: plan.duration_days,
        amount,
        // Prix catalogue au jour de l'ouverture : l'écart avec `amount` se lit
        // comme une remise accordée par l'administrateur.
        catalog_price: plan.price,
        payment_method: amount > 0 ? (input.payment_method ?? 'cash') : null,
        payment_reference: amount > 0 ? reference : null,
        replaced: closed.map((c) => c.id),
        note: input.note ?? null,
      },
      triggered_by: 'admin',
      triggered_by_user_id: input.admin_id,
    })

    return subscription
  }

  private async verifyCode(input: GrantSubscriptionInput, amount: number): Promise<void> {
    const pending = await OtpCode.findActive(input.admin_id, 'subscription_grant')
    if (!pending) {
      throw new DomainError(
        'grant_code_missing',
        'Aucun code en cours de validité : demandez-en un nouveau.',
        422
      )
    }
    if (pending.context !== grantContext({ ...input, amount })) {
      throw new DomainError(
        'grant_code_mismatch',
        'Ce code a été demandé pour un autre propriétaire, forfait ou montant. Demandez-en un nouveau.',
        422
      )
    }

    const result = await OtpService.verify({
      userId: input.admin_id,
      purpose: 'subscription_grant',
      plainCode: input.code,
    })
    if (!result.ok) {
      const messages = {
        not_found: 'Aucun code en cours de validité : demandez-en un nouveau.',
        expired: 'Ce code a expiré : demandez-en un nouveau.',
        max_attempts: 'Trop de codes incorrects : demandez-en un nouveau.',
        invalid_code: 'Code incorrect.',
      } as const
      throw new DomainError(`grant_code_${result.reason}`, messages[result.reason], 422)
    }
  }
}

export default GrantSubscriptionUseCase
