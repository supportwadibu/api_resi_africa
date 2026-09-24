import SubscriptionRepository from '#features/subscriptions/repositories/subscription_repository'
import { DomainError } from '#utils/domain_error'

import type { UserDetailDto, UserManagerAssignmentDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/**
 * Fiche d'un compte, complétée des informations propres à son rôle.
 *
 * Les lectures annexes ne sont lancées que pour le rôle qui en a l'usage :
 * chercher l'abonnement d'un client ou l'affectation d'un propriétaire
 * coûterait des lectures Firestore pour un bloc toujours vide.
 */
export class GetUserUseCase {
  constructor(
    private repo: UserRepository = new UserRepository(),
    private subscriptions: SubscriptionRepository = new SubscriptionRepository()
  ) {}

  async execute(id: string): Promise<UserDetailDto> {
    const user = await this.repo.findEntity(id)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }

    const base = UserRepository.toDto(user.raw)

    const [activeSessions, owner, managerAssignment] = await Promise.all([
      this.repo.countActiveSessions(id),
      base.role === 'proprio' ? this.loadOwnerBlock(user.raw) : Promise.resolve(null),
      base.role === 'gerant' ? this.loadManagerAssignment(id) : Promise.resolve(null),
    ])

    return {
      ...base,
      active_sessions: activeSessions,
      owner,
      manager_assignment: managerAssignment,
    }
  }

  private async loadOwnerBlock(raw: {
    _id: string
    profile?: { submitted_at?: Date | null } | null
    validated_by?: string | null
    validated_at?: Date | null
    rejection_reason?: string | null
  }): Promise<UserDetailDto['owner']> {
    const subscription = await this.subscriptions.findCurrentByUser(raw._id)

    return {
      // Les comptes antérieurs au dossier de validation n'ont pas de bloc
      // `profile` complet : même repli que `OwnerRepository.toDto`.
      profile_submitted: Boolean(raw.profile?.submitted_at),
      validated_by: raw.validated_by ?? null,
      validated_at: raw.validated_at ?? null,
      rejection_reason: raw.rejection_reason ?? null,
      subscription,
    }
  }

  private async loadManagerAssignment(id: string): Promise<UserManagerAssignmentDto | null> {
    const assignment = await this.repo.findManagerAssignment(id)
    if (!assignment) return null

    const owners = await this.repo.findSummaries([assignment.owner_id])

    return {
      owner: owners.get(assignment.owner_id) ?? null,
      owner_id: assignment.owner_id,
      property_ids: assignment.property_ids ?? [],
      is_active: assignment.is_active ?? false,
    }
  }
}

export default GetUserUseCase
