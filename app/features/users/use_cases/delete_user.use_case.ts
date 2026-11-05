import { DomainError } from '#utils/domain_error'

import type { UserDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/**
 * Suppression douce d'un compte : désactivé, sessions fermées, mis de côté
 * jusqu'à sa restauration ou sa suppression définitive.
 *
 * Aucune donnée n'est effacée. L'e-mail et le téléphone restent pris : les
 * libérer permettrait à quelqu'un d'autre de s'inscrire avec, et rendrait la
 * restauration impossible.
 */
export class DeleteUserUseCase {
  constructor(private repo: UserRepository = new UserRepository()) {}

  async execute(input: {
    user_id: string
    admin_id: string
  }): Promise<{ user: UserDto; revoked_sessions: number }> {
    const { user_id: userId, admin_id: adminId } = input

    // Même garde que la désactivation : seul, l'administrateur n'aurait plus
    // personne pour lui rendre l'accès.
    if (userId === adminId) {
      throw new DomainError(
        'cannot_delete_self',
        'Vous ne pouvez pas supprimer votre propre compte.',
        409
      )
    }

    const user = await this.repo.findEntity(userId)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }
    if (user.raw.is_deleted) {
      throw new DomainError('user_already_deleted', 'Ce compte est déjà supprimé.', 409)
    }

    const updated = await this.repo.markDeleted(user, adminId)
    // Après l'écriture, comme pour la désactivation : le compte est déjà
    // refusé par le middleware, la révocation vide la liste des appareils.
    const revokedSessions = await this.repo.revokeSessions(userId)

    return {
      user: UserRepository.toDto((updated ?? user).raw),
      revoked_sessions: revokedSessions,
    }
  }
}

export default DeleteUserUseCase
