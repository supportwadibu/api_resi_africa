import { resolvePlanAccess, type PlanAccess } from '../plan_access.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Accès ouvert par l'abonnement d'un propriétaire, maintenant.
 *
 * Lecture seule : appelé à chaque requête par le middleware `plan()`, il
 * n'expire rien — `resolvePlanAccess` écarte déjà un abonnement échu.
 *
 * Tous les abonnements vivants sont examinés et le meilleur accès l'emporte :
 * un `pending` resté dans l'historique ne doit pas masquer l'abonnement payé
 * qui l'accompagne.
 */
export class ResolvePlanAccessUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(ownerId: string, now: Date = new Date()): Promise<PlanAccess> {
    const subscriptions = await this.repo.findLiveByUser(ownerId)
    const accesses = subscriptions.map((s) => resolvePlanAccess(s, now))

    if (accesses.includes('full')) return 'full'
    if (accesses.includes('basic')) return 'basic'
    return null
  }
}

export default ResolvePlanAccessUseCase
