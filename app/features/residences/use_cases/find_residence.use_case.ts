import { DomainError } from '#utils/domain_error'

import type { ResidenceDto } from '../dto/residence.dto.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

export class FindResidenceUseCase {
  constructor(private repo: ResidenceRepository = new ResidenceRepository()) {}

  async execute(id: string, owner_id: string): Promise<ResidenceDto> {
    const residence = await this.repo.findById(id, owner_id)
    if (!residence) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }
    return residence
  }
}

export default FindResidenceUseCase
