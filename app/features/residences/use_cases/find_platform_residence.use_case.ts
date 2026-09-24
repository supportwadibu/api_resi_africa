import { groupUnitsByResidence } from '#features/properties/portfolio'
import PropertyRepository from '#features/properties/repositories/property_repository'
import UserRepository from '#features/users/repositories/user_repository'
import { DomainError } from '#utils/domain_error'

import type { PlatformResidenceDto } from '#features/properties/dto/platform_property.dto'

import ResidenceRepository from '../repositories/residence_repository.ts'

/** Fiche d'une résidence pour le back-office, unités comprises. */
export class FindPlatformResidenceUseCase {
  constructor(
    private residences: ResidenceRepository = new ResidenceRepository(),
    private properties: PropertyRepository = new PropertyRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(id: string): Promise<PlatformResidenceDto> {
    const residence = await this.residences.findAnyById(id)
    if (!residence) {
      throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
    }

    const [units, owners] = await Promise.all([
      this.properties.listByResidenceIds([residence.id]),
      this.users.findSummaries([residence.owner_id]),
    ])

    const [grouped] = groupUnitsByResidence([residence], units).residences

    return { ...grouped, owner: owners.get(residence.owner_id) ?? null }
  }
}

export default FindPlatformResidenceUseCase
