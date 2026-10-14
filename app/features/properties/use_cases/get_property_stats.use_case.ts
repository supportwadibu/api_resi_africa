import type { PropertyStatsDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class GetPropertyStatsUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(owner_id: string): Promise<PropertyStatsDto> {
    return this.repo.stats(owner_id)
  }
}

export default GetPropertyStatsUseCase
