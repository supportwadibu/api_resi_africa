/* eslint-disable prettier/prettier */
import { normalizeNegotiation } from '#features/negotiations/negotiation_rules'
import { DomainError } from '#utils/domain_error'

import type { PropertyDto, UpdatePropertyInput } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class UpdatePropertyUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(id: string, input: UpdatePropertyInput, owner_id?: string): Promise<PropertyDto> {
    if (input.pricing?.daily_price !== undefined && input.pricing.daily_price <= 0) {
      throw new DomainError('invalid_daily_price', 'Le tarif par jour doit être positif.', 422)
    }
    if (input.details?.surface_area !== undefined && input.details.surface_area <= 0) {
      throw new DomainError('invalid_surface', 'La surface doit être positive.', 422)
    }

    // Les paliers se jugent contre le prix normal : celui de la même requête
    // s'il change, sinon celui en base.
    let negotiation = input.negotiation
    if (negotiation) {
      const current = input.pricing?.daily_price === undefined ? await this.repo.findById(id) : null
      const dailyPrice = input.pricing?.daily_price ?? current?.pricing.daily_price ?? 0
      negotiation = normalizeNegotiation(negotiation, dailyPrice)
    }

    const updated = await this.repo.update(
      id,
      negotiation ? { ...input, negotiation } : input,
      owner_id
    )
    if (!updated) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    return updated
  }
}

export default UpdatePropertyUseCase
