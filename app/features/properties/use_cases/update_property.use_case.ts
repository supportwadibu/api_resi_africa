/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  PropertyDto,
  UpdatePropertyInput,
} from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class UpdatePropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) { }

  async execute(id: string, input: UpdatePropertyInput, owner_id?: string): Promise<PropertyDto> {
    if (input.pricing?.daily_price !== undefined && input.pricing.daily_price <= 0) {
      throw new DomainError('invalid_daily_price', 'Le tarif par jour doit être positif.', 422)
    }
    if (input.details?.surface_area !== undefined && input.details.surface_area <= 0) {
      throw new DomainError('invalid_surface', 'La surface doit être positive.', 422)
    }

    const updated = await this.repo.update(id, input, owner_id)
    if (!updated) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    return updated
  }
}

export default UpdatePropertyUseCase
