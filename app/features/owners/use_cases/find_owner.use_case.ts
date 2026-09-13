import { DomainError } from '#utils/domain_error'

import type { OwnerDto } from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/**
 * Récupère un owner par son ID. Lève 404 si introuvable ou si l'utilisateur
 * n'a pas le rôle "proprio".
 */
export class FindOwnerUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(id: string): Promise<OwnerDto> {
    const owner = await this.repo.findById(id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }
    return owner
  }
}

export default FindOwnerUseCase
