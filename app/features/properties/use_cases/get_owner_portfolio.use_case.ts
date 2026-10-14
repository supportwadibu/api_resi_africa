import OwnerRepository from '#features/owners/repositories/owner_repository'
import ResidenceRepository from '#features/residences/repositories/residence_repository'
import { DomainError } from '#utils/domain_error'

import type { OwnerPortfolioDto } from '../dto/platform_property.dto.ts'
import { buildOwnerPortfolio } from '../portfolio.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/**
 * Portefeuille d'un propriétaire : ses résidences avec leurs unités, puis ses
 * logements autonomes.
 *
 * Lu en entier, dans la limite de `SCOPE_READ_LIMIT` : une page partielle de
 * logements laisserait des résidences apparemment vides et fausserait les
 * totaux. Un propriétaire compte ses logements en dizaines.
 */
export class GetOwnerPortfolioUseCase {
  constructor(
    private owners: OwnerRepository = new OwnerRepository(),
    private properties: PropertyRepository = new PropertyRepository(),
    private residences: ResidenceRepository = new ResidenceRepository()
  ) {}

  async execute(ownerId: string): Promise<OwnerPortfolioDto> {
    const owner = await this.owners.findById(ownerId)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    const [residences, properties] = await Promise.all([
      this.residences.listAll(ownerId),
      this.properties.listAllInScope({ owner_id: ownerId }),
    ])

    return buildOwnerPortfolio(residences, properties)
  }
}

export default GetOwnerPortfolioUseCase
