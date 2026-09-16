import { groupResidencesForScope } from '../residence_scope_view.ts'

import type { ScopedResidenceView } from '../residence_scope_view.ts'
import type { PropertyDto } from '../../properties/dto/property.dto.ts'
import type { ResidenceDto } from '../dto/residence.dto.ts'
import type { ActorScope } from '#features/managers/scope'
import PropertyRepository from '../../properties/repositories/property_repository.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

/** Plafond de lecture, aligné sur les autres regroupements du dépôt. */
const READ_LIMIT = 1000

export type ScopedResidenceDto = ScopedResidenceView<ResidenceDto, PropertyDto>

/**
 * Résidences contenant au moins un logement du périmètre.
 *
 * Use case distinct de `ListOwnerResidencesUseCase` et non une variante de
 * celui-ci : ce n'est pas la même lecture. Le propriétaire liste ses
 * résidences, qui existent par elles-mêmes ; le gérant reçoit un
 * **regroupement d'affichage** de ses logements, où la résidence n'est qu'un
 * en-tête. La spec le pose ainsi — la résidence n'est jamais l'unité
 * d'affectation.
 *
 * Non paginé : le regroupement se construit sur le périmètre entier, et une
 * page partielle de logements donnerait des compteurs d'unités faux.
 */
export class ListScopedResidencesUseCase {
  constructor(
    private residences: ResidenceRepository = new ResidenceRepository(),
    private properties: PropertyRepository = new PropertyRepository()
  ) {}

  async execute(scope: ActorScope): Promise<ScopedResidenceDto[]> {
    const [residences, units] = await Promise.all([
      this.residences.paginate(scope.ownerId, { page: 1, per_page: READ_LIMIT }),
      this.properties.paginate({
        owner_id: scope.ownerId,
        scope_property_ids: scope.propertyIds,
        page: 1,
        per_page: READ_LIMIT,
      }),
    ])

    // `units_count` est recomposé par `groupResidencesForScope` : le champ
    // dénormalisé compte les logements de toute la résidence et trahirait
    // l'existence de ceux qui ne sont pas confiés au gérant.
    return groupResidencesForScope(residences.data, units.data)
  }
}

export default ListScopedResidencesUseCase
