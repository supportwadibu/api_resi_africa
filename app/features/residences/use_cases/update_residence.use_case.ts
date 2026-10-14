import { DomainError } from '#utils/domain_error'

import type { ResidenceDto, UpdateResidenceInput } from '../dto/residence.dto.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

/**
 * Modifie une résidence.
 *
 * L'adresse corrigée ici ne se propage pas aux unités déjà rattachées : elle y
 * a été copiée à l'instant du rattachement, et la réécrire changerait
 * l'adresse d'annonces publiées. Le propriétaire qui veut propager la
 * correction la réapplique sur chaque unité.
 */
export class UpdateResidenceUseCase {
  constructor(private repo: ResidenceRepository = new ResidenceRepository()) {}

  async execute(id: string, input: UpdateResidenceInput, owner_id: string): Promise<ResidenceDto> {
    const updated = await this.repo.update(id, input, owner_id)
    if (!updated) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }
    return updated
  }
}

export default UpdateResidenceUseCase
