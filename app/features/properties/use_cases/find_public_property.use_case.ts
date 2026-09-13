import { DomainError } from '#utils/domain_error'

import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class FindPublicPropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(id: string): Promise<PropertyDto> {
    const property = await this.repo.findById(id)

    if (!property) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    if (!property.visibility.is_public || property.status !== 'published') {
      throw new DomainError(
        'property_not_public',
        'Cette propriété n’est pas disponible publiquement.',
        403
      )
    }

    await this.repo.incrementViews(id)
    return property
  }
}

export default FindPublicPropertyUseCase
