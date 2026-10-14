import { DomainError } from '#utils/domain_error'

import type { OwnerProfileDto } from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'
import { SubmitOwnerProfileUseCase } from './submit_owner_profile.use_case.ts'

/**
 * Dossier de validation du propriétaire connecté.
 *
 * Alimente l'écran de finalisation d'inscription : à la réouverture, les champs
 * déjà renseignés sont repris et les justificatifs déposés sont affichés, ce qui
 * évite de tout ressaisir pour corriger une seule ligne.
 */
export class GetOwnerProfileUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(userId: string): Promise<OwnerProfileDto> {
    const owner = await this.repo.findEntityById(userId)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    return SubmitOwnerProfileUseCase.toDto(owner)
  }
}

export default GetOwnerProfileUseCase
