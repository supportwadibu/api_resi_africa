import logger from '@adonisjs/core/services/logger'

import OwnerRepository from '#features/owners/repositories/owner_repository'
import PlanRepository from '#features/plans/repositories/plan_repository'
import User from '#models/user'
import NotificationService from '#services/notification_service'
import OtpService from '#services/otp_service'
import { DomainError } from '#utils/domain_error'

import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { grantContext, grantRefusal } from '../subscription_grant.ts'

/**
 * Première étape de l'enregistrement d'un abonnement par un administrateur :
 * vérifie la demande, puis envoie un code à **l'e-mail de l'administrateur**.
 *
 * Le code confirme que la personne derrière la session est bien titulaire du
 * compte admin : ouvrir un abonnement sans paiement engage RESI, et une
 * session restée ouverte ne doit pas suffire. Il ne vaut que pour ce
 * propriétaire, ce forfait et ce montant (`grantContext`).
 *
 * Les refus prévisibles (propriétaire inconnu, plan retiré, abonnement payant
 * en cours) tombent ici, avant l'envoi : un code envoyé pour rien obligerait
 * l'admin à relire sa boîte pour découvrir l'erreur.
 */
export class RequestSubscriptionGrantCodeUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private owners: Pick<OwnerRepository, 'findById'> = new OwnerRepository(),
    private plans: Pick<PlanRepository, 'findById'> = new PlanRepository()
  ) {}

  async execute(input: {
    admin_id: string
    user_id: string
    plan_id: string
    amount?: number
  }): Promise<{ email: string; expires_at: Date; amount: number }> {
    const admin = await User.findById(input.admin_id)
    const email = admin?.email?.trim()
    if (!email) {
      throw new DomainError(
        'admin_email_missing',
        "Votre compte administrateur n'a pas d'adresse e-mail : impossible d'envoyer le code.",
        422
      )
    }

    const { amount } = await loadGrantTargets(this.owners, this.plans, input)

    await this.repo.expireOverdue(input.user_id)
    const refusal = grantRefusal(await this.repo.findLiveByUser(input.user_id))
    if (refusal) throw refusal

    const { otp, plainCode } = await OtpService.generate({
      userId: input.admin_id,
      channel: 'email',
      target: email,
      purpose: 'subscription_grant',
      context: grantContext({ ...input, amount }),
    })

    try {
      await NotificationService.sendOtp({
        channel: 'email',
        target: email,
        code: plainCode,
        purpose: 'subscription_grant',
      })
    } catch (error) {
      logger.error({ err: error }, "Échec d'envoi du code d'enregistrement d'abonnement")
      throw new DomainError(
        'otp_send_failed',
        "Le code n'a pas pu être envoyé. Réessayez dans un instant.",
        502
      )
    }

    return { email, expires_at: otp.expires_at, amount }
  }
}

/**
 * Propriétaire et plan d'un enregistrement, et le montant retenu : celui saisi
 * par l'admin, le prix du plan à défaut.
 *
 * Le plan doit être actif : on n'ouvre pas un forfait retiré du catalogue, que
 * le propriétaire ne pourrait pas renouveler ensuite.
 */
export async function loadGrantTargets(
  owners: Pick<OwnerRepository, 'findById'>,
  plans: Pick<PlanRepository, 'findById'>,
  input: { user_id: string; plan_id: string; amount?: number }
) {
  const owner = await owners.findById(input.user_id)
  if (!owner) {
    throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
  }

  const plan = await plans.findById(input.plan_id)
  if (!plan) {
    throw new DomainError('plan_not_found', 'Plan introuvable.', 404)
  }
  if (!plan.is_active) {
    throw new DomainError('plan_inactive', "Ce plan n'est plus disponible à la souscription.", 409)
  }

  return { owner, plan, amount: Math.round(input.amount ?? plan.price) }
}

export default RequestSubscriptionGrantCodeUseCase
