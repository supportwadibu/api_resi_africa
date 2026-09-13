import { DomainError } from '#utils/domain_error'

import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class UnpublishPropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(id: string, owner_id: string): Promise<PropertyDto> {
    const updated = await this.repo.update(
      id,
      {
        status: 'draft',
        visibility: { is_public: false },
      },
      owner_id
    )
    if (!updated) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    return updated
  }
}

export default UnpublishPropertyUseCase
