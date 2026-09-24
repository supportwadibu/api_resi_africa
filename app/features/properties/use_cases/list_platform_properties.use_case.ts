import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import ResidenceRepository from '#features/residences/repositories/residence_repository'
import UserRepository from '#features/users/repositories/user_repository'

import type {
  ListPlatformPropertiesInput,
  ListPlatformPropertiesOutput,
} from '../dto/platform_property.dto.ts'
import { attachPropertyRelations } from '../portfolio.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/**
 * Logements de la plateforme, chacun avec son propriétaire et sa résidence.
 *
 * Les relations sont lues en lot pour la seule page affichée : deux lectures
 * groupées au lieu d'une par ligne.
 */
export class ListPlatformPropertiesUseCase {
  constructor(
    private properties: PropertyRepository = new PropertyRepository(),
    private residences: ResidenceRepository = new ResidenceRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(input: ListPlatformPropertiesInput): Promise<ListPlatformPropertiesOutput> {
    const { data, total } = await this.properties.paginate({
      owner_id: input.owner_id,
      residence_id: input.residence_id,
      status: input.status,
      property_type: input.property_type,
      page: input.page,
      per_page: input.per_page,
    })

    const [owners, residences] = await Promise.all([
      this.users.findSummaries(data.map((p) => p.owner_id)),
      this.residences.findManyByIds(data.map((p) => p.residence_id)),
    ])

    return {
      data: attachPropertyRelations(data, owners, residences),
      meta: buildPaginationMeta(total, input),
    }
  }
}

export default ListPlatformPropertiesUseCase
