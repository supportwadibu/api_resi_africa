import { DomainError } from '#utils/domain_error'

import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class FindPropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(id: string, owner_id?: string): Promise<PropertyDto> {
    const property = owner_id
      ? await this.repo.findByIdAndOwner(id, owner_id)
      : await this.repo.findById(id)

    if (!property) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    return property
  }
}

export default FindPropertyUseCase
