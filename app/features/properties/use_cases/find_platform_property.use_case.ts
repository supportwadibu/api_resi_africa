import ResidenceRepository from '#features/residences/repositories/residence_repository'
import UserRepository from '#features/users/repositories/user_repository'
import { DomainError } from '#utils/domain_error'

import type { PlatformPropertyDto } from '../dto/platform_property.dto.ts'
import { attachPropertyRelations } from '../portfolio.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/** Fiche d'un logement pour le back-office, quel que soit son propriétaire. */
export class FindPlatformPropertyUseCase {
  constructor(
    private properties: PropertyRepository = new PropertyRepository(),
    private residences: ResidenceRepository = new ResidenceRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(id: string): Promise<PlatformPropertyDto> {
    const property = await this.properties.findById(id)
    if (!property) {
      throw new DomainError('property_not_found', 'Logement introuvable.', 404)
    }

    const [owners, residences] = await Promise.all([
      this.users.findSummaries([property.owner_id]),
      this.residences.findManyByIds([property.residence_id]),
    ])

    return attachPropertyRelations([property], owners, residences)[0]
  }
}

export default FindPlatformPropertyUseCase
