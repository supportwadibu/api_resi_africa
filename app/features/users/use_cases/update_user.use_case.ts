import { DomainError } from '#utils/domain_error'

import type { UpdateUserInput, UserDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/**
 * Modification d'un compte par un administrateur.
 *
 * La désactivation ferme aussi toutes les sessions ouvertes. Le middleware
 * d'authentification refuse déjà un compte inactif à chaque requête ; la
 * révocation vide en plus la liste des appareils connectés, qui sans elle
 * continuerait d'afficher des sessions mortes.
 */
export class UpdateUserUseCase {
  constructor(private repo: UserRepository = new UserRepository()) {}

  async execute(input: {
    user_id: string
    admin_id: string
    patch: UpdateUserInput
  }): Promise<{ user: UserDto; revoked_sessions: number }> {
    const { user_id: userId, admin_id: adminId, patch } = input

    // Un administrateur qui se désactive lui-même perd l'accès au back-office
    // sur-le-champ, sans personne pour le lui rendre s'il est seul.
    if (patch.is_active === false && userId === adminId) {
      throw new DomainError(
        'cannot_deactivate_self',
        'Vous ne pouvez pas désactiver votre propre compte.',
        409
      )
    }

    const user = await this.repo.findEntity(userId)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }

    if (patch.email !== undefined && patch.email !== user.email) {
      if (await this.repo.isEmailTaken(patch.email, userId)) {
        throw new DomainError(
          'email_already_used',
          'Un autre compte utilise déjà cette adresse e-mail.',
          409
        )
      }
      user.email = patch.email
    }

    if (patch.phone !== undefined && patch.phone !== user.phone) {
      if (await this.repo.isPhoneTaken(patch.phone, userId)) {
        throw new DomainError(
          'phone_already_used',
          'Un autre compte utilise déjà ce numéro de téléphone.',
          409
        )
      }
      user.phone = patch.phone
    }

    if (patch.full_name !== undefined) user.full_name = patch.full_name

    const deactivated = patch.is_active === false && user.is_active
    if (patch.is_active !== undefined) user.is_active = patch.is_active

    await this.repo.save(user)

    // Révocation après l'écriture : si elle échouait avant, le compte resterait
    // actif avec des sessions fermées, ce qui ne protège de rien.
    const revokedSessions = deactivated ? await this.repo.revokeSessions(userId) : 0

    return { user: UserRepository.toDto(user.raw), revoked_sessions: revokedSessions }
  }
}

export default UpdateUserUseCase
