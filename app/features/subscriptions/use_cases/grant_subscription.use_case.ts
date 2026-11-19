import OwnerRepository from '#features/owners/repositories/owner_repository'
import PlanRepository from '#features/plans/repositories/plan_repository'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { planGrant } from '../subscription_grant.ts'

/**
 * Ouvre un abonnement à un propriétaire sur décision d'un administrateur,
 * sans passer par Wave : paiement reçu hors application, geste commercial,
 * compte de démonstration.
 *
 * Rien n'est encaissé, donc ni dépense chez le propriétaire, ni qualification
 * de parrainage (`onSubscriptionPaid` rémunère un paiement réel). L'ouverture
 * est tracée dans `subscription_events`, avec l'administrateur et le motif,
 * pour qu'un abonnement à 0 F se justifie à la relecture.
 *
 * Le plan doit être actif : on n'ouvre pas un forfait retiré du catalogue,
 * que le propriétaire ne pourrait pas renouveler ensuite.
 */
export class GrantSubscriptionUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private owners: Pick<OwnerRepository, 'findById'> = new OwnerRepository(),
    private plans: Pick<PlanRepository, 'findById'> = new PlanRepository()
  ) {}

  async execute(input: {
    user_id: string
    plan_id: string
    reason?: string
    admin_id: string
  }): Promise<SubscriptionDto> {
    const owner = await this.owners.findById(input.user_id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    const plan = await this.plans.findById(input.plan_id)
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

    const { subscription, closed } = await this.repo.grant(input.user_id, (live) =>
      planGrant(
        {
          user_id: input.user_id,
          plan_id: plan.id,
          plan_tier: plan.tier,
          duration_days: plan.duration_days,
        },
        live
      )
    )

    await this.repo.recordEvent({
      user_id: input.user_id,
      subscription_id: subscription.id,
      event_type: 'granted',
      description: `Ouvert par un administrateur, sans paiement (${plan.name}).`,
      previous_status: null,
      new_status: subscription.status,
      metadata: {
        plan_id: plan.id,
        duration_days: plan.duration_days,
        // Prix catalogue au jour de l'ouverture : ce que l'abonnement aurait coûté.
        catalog_price: plan.price,
        replaced: closed.map((c) => c.id),
        reason: input.reason ?? null,
      },
      triggered_by: 'admin',
      triggered_by_user_id: input.admin_id,
    })

    return subscription
  }
}

export default GrantSubscriptionUseCase
