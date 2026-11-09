import OwnerRepository from '#features/owners/repositories/owner_repository'
import { higherTier, type PlanTier } from '#features/plans/plan_tier'

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
 *
 * Sans abonnement en cours, le propriétaire reste sur RESI Basic, gratuit :
 * un abonnement échu ne bloque plus le comptoir, il retire seulement ce que le
 * palier payé ouvrait. Seul un compte rejeté ou suspendu n'a aucun accès.
 */
export class ResolvePlanAccessUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private owners: OwnerRepository = new OwnerRepository()
  ) {}

  async execute(ownerId: string, now: Date = new Date()): Promise<PlanAccess> {
    const subscriptions = await this.repo.findLiveByUser(ownerId)

    let best: PlanTier | null = null
    for (const access of subscriptions.map((s) => resolvePlanAccess(s, now))) {
      if (access) best = best ? higherTier(best, access) : access
    }
    if (best) return best

    const owner = await this.owners.findById(ownerId)
    if (!owner || owner.owner_status === 'rejected' || owner.owner_status === 'suspended') {
      return null
    }

    // Aucun essai n'est plus ouvert d'office : le propriétaire choisit le
    // palier qu'il essaie (`StartTrialForOwnerUseCase`). D'ici là, l'API le
    // traite en RESI Basic et l'application le retient sur l'écran de choix
    // (`trial_choice_required`).
    return 'free'
  }
}

export default ResolvePlanAccessUseCase
