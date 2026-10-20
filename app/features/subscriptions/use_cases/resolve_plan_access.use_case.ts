import OwnerRepository from '#features/owners/repositories/owner_repository'
import { higherTier, type PlanTier } from '#features/plans/plan_tier'
import { TRIAL_DURATION_DAYS } from '#utils/enums/subscription_status'

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

    return (await this.ensureTrial(ownerId)) ? 'pro_plus' : 'free'
  }

  /**
   * Essai garanti : un propriétaire qui n'a jamais eu d'abonnement reçoit son
   * essai au premier accès.
   *
   * L'inscription l'ouvre déjà, mais ce filet couvre les comptes créés avant
   * — l'inscription par e-mail n'en ouvrait pas — et un essai dont l'ouverture
   * a échoué, l'inscription n'en faisant pas une condition. Sans lui, un
   * propriétaire qu'on a annoncé en essai serait bloqué devant les forfaits.
   *
   * Jamais pour un compte rejeté ou suspendu — l'appelant les a écartés :
   * l'essai sert à découvrir l'application pendant l'examen du dossier, pas à
   * contourner une décision. Un essai échu ne se rouvre pas : l'historique
   * suffit à l'écarter.
   */
  private async ensureTrial(ownerId: string): Promise<boolean> {
    if (await this.repo.existsForUser(ownerId)) return false

    // `null` : ouvert entre-temps par une requête concurrente — l'essai
    // existe, l'accès est ouvert.
    await this.repo.startTrialOnce(ownerId, TRIAL_DURATION_DAYS)
    return true
  }
}

export default ResolvePlanAccessUseCase
