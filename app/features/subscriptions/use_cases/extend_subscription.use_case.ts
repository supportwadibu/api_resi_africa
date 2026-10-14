import { DomainError } from '#utils/domain_error'

import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { planExtension } from '../subscription_extension.ts'

/**
 * Prolonge un abonnement en cours, sur décision d'un administrateur.
 *
 * Geste commercial ou réparation — une panne, un paiement reçu hors
 * application —, sans paiement Wave : il est donc tracé dans
 * `subscription_events`, avec l'administrateur et le motif, pour qu'une
 * échéance repoussée se justifie à la relecture.
 */
export class ExtendSubscriptionUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(input: {
    subscription_id: string
    days: number
    reason?: string
    admin_id: string
  }): Promise<SubscriptionDto> {
    const current = await this.repo.findById(input.subscription_id)
    if (!current) {
      throw new DomainError('subscription_not_found', 'Souscription introuvable.', 404)
    }

    const patch = planExtension(current, input.days)
    const updated = await this.repo.extend(current.id, patch)
    if (!updated) {
      throw new DomainError('subscription_not_found', 'Souscription introuvable.', 404)
    }

    await this.repo.recordEvent({
      user_id: current.user_id,
      subscription_id: current.id,
      event_type: 'extended',
      description: `Prolongé de ${input.days} jour(s) par un administrateur.`,
      previous_status: current.status,
      new_status: updated.status,
      metadata: {
        days: input.days,
        previous_end_date: current.end_date,
        new_end_date: updated.end_date,
        reason: input.reason ?? null,
      },
      triggered_by: 'admin',
      triggered_by_user_id: input.admin_id,
    })

    return updated
  }
}

export default ExtendSubscriptionUseCase
