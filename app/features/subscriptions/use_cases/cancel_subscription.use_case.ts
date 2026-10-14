/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'
import { SubscriptionStatusEnum } from '#utils/enums/subscription_status'

import type {
  CancelSubscriptionInput,
  SubscriptionDto,
} from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Annule une souscription (action admin ou owner).
 * Refuse si la souscription est déjà terminale (expired/cancelled).
 */
export class CancelSubscriptionUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(input: CancelSubscriptionInput): Promise<SubscriptionDto> {
    const current = await this.repo.findById(input.subscription_id)
    if (!current) {
      throw new DomainError('subscription_not_found', 'Souscription introuvable.', 404)
    }
    if (current.status === 'expired' || current.status === 'cancelled') {
      throw new DomainError(
        'subscription_not_active',
        "La souscription n'est plus active.",
        409
      )
    }

    const updated = await this.repo.updateStatus(
      input.subscription_id,
      SubscriptionStatusEnum.CANCELLED,
      { cancel_reason: input.reason ?? 'admin_cancel' }
    )
    if (!updated) {
      throw new DomainError('subscription_not_found', 'Souscription introuvable.', 404)
    }
    return updated
  }
}

export default CancelSubscriptionUseCase
