import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { groupUnitsByResidence } from '#features/properties/portfolio'
import PropertyRepository from '#features/properties/repositories/property_repository'
import UserRepository from '#features/users/repositories/user_repository'

import type {
  ListPlatformResidencesInput,
  ListPlatformResidencesOutput,
} from '#features/properties/dto/platform_property.dto'

import ResidenceRepository from '../repositories/residence_repository.ts'

/**
 * Résidences de la plateforme, chacune avec son propriétaire et ses unités.
 *
 * Les unités sont lues pour les seules résidences de la page. Les logements
 * autonomes n'y figurent pas : ils n'appartiennent à aucune résidence et se
 * consultent dans la liste des logements.
 */
export class ListPlatformResidencesUseCase {
  constructor(
    private residences: ResidenceRepository = new ResidenceRepository(),
    private properties: PropertyRepository = new PropertyRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(input: ListPlatformResidencesInput): Promise<ListPlatformResidencesOutput> {
    const { data, total } = await this.residences.paginatePlatform(input)

    const [units, owners] = await Promise.all([
      this.properties.listByResidenceIds(data.map((r) => r.id)),
      this.users.findSummaries(data.map((r) => r.owner_id)),
    ])

    const { residences } = groupUnitsByResidence(data, units)

    return {
      data: residences.map((residence) => ({
        ...residence,
        owner: owners.get(residence.owner_id) ?? null,
      })),
      meta: buildPaginationMeta(total, input),
    }
  }
}

export default ListPlatformResidencesUseCase
