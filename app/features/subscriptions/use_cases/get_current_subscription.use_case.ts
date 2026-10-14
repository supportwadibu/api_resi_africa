import type { SubscriptionDto } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Renvoie la souscription "vivante" de l'owner (pending/trial/active),
 * ou null s'il n'en a pas (ou si elle vient d'être expirée).
 *
 * Effet de bord utile : expire passivement les souscriptions dont
 * end_date est dépassée avant de renvoyer la réponse.
 */
export class GetCurrentSubscriptionUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(userId: string): Promise<SubscriptionDto | null> {
    await this.repo.expireOverdue(userId)
    return this.repo.findCurrentByUser(userId)
  }
}

export default GetCurrentSubscriptionUseCase
