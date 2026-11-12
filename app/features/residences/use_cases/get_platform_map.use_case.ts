import PropertyRepository from '#features/properties/repositories/property_repository'
import UserRepository from '#features/users/repositories/user_repository'

import { buildMapPoints, type PlatformMapDto } from '../platform_map.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

/**
 * Borne de lecture par collection. La carte lit tout d'un coup — il faut
 * chaque point pour chercher et filtrer côté navigateur — et la borne évite
 * qu'une plateforme qui grandit fasse d'un chargement du tableau de bord des
 * dizaines de milliers de lectures. Atteinte, elle est signalée
 * (`truncated`) plutôt que tue.
 */
export const MAP_READ_LIMIT = 3000

/** Résidences et logements autonomes de la plateforme, placés sur la carte. */
export class GetPlatformMapUseCase {
  constructor(
    private residences: ResidenceRepository = new ResidenceRepository(),
    private properties: PropertyRepository = new PropertyRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(): Promise<PlatformMapDto> {
    const [residences, properties] = await Promise.all([
      this.residences.listForMap(MAP_READ_LIMIT),
      this.properties.listForMap(MAP_READ_LIMIT),
    ])

    const owners = await this.users.findSummaries([
      ...new Set([...residences, ...properties].map((doc) => doc.owner_id)),
    ])

    return {
      ...buildMapPoints(residences, properties, owners),
      truncated: residences.length >= MAP_READ_LIMIT || properties.length >= MAP_READ_LIMIT,
    }
  }
}

export default GetPlatformMapUseCase
