import { DomainError } from '#utils/domain_error'

import type { UserDto } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/**
 * Restauration d'un compte supprimé, dans l'état où il était : un compte
 * désactivé avant sa suppression le reste.
 */
export class RestoreUserUseCase {
  constructor(private repo: UserRepository = new UserRepository()) {}

  async execute(userId: string): Promise<UserDto> {
    const user = await this.repo.findEntity(userId)
    if (!user) {
      throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)
    }
    if (!user.raw.is_deleted) {
      throw new DomainError('user_not_deleted', "Ce compte n'est pas supprimé.", 409)
    }

    const updated = await this.repo.markRestored(user)
    return UserRepository.toDto((updated ?? user).raw)
  }
}

export default RestoreUserUseCase
