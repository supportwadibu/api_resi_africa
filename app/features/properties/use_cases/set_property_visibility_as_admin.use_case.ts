import { DomainError } from '#utils/domain_error'

import OwnerRepository from '#features/owners/repositories/owner_repository'

import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/**
 * Met en ligne une annonce, ou la retire de la vitrine, depuis le backoffice.
 *
 * Même effet que les gestes du propriétaire (`PublishPropertyUseCase`,
 * `UnpublishPropertyUseCase`), sans le contrôle d'appartenance : l'admin agit
 * sur n'importe quel logement.
 *
 * Le dossier d'identité n'est pas exigé : l'admin qui publie en prend la
 * responsabilité, et c'est souvent pour débloquer un propriétaire qui ne
 * parvient pas à le faire lui-même. Un compte rejeté ou suspendu reste en
 * revanche exclu de la vitrine — le publier contredirait la décision prise
 * sur ce compte.
 */
export class SetPropertyVisibilityAsAdminUseCase {
  constructor(
    private repo: Pick<PropertyRepository, 'findById' | 'update'> = new PropertyRepository(),
    private owners: Pick<OwnerRepository, 'findById'> = new OwnerRepository()
  ) {}

  async execute(id: string, publish: boolean): Promise<PropertyDto> {
    const property = await this.repo.findById(id)
    if (!property) {
      throw new DomainError('property_not_found', 'Logement introuvable.', 404)
    }

    if (publish) {
      const owner = await this.owners.findById(property.owner_id)
      if (owner?.owner_status === 'rejected' || owner?.owner_status === 'suspended') {
        throw new DomainError(
          'owner_not_operational',
          'Le compte du propriétaire est rejeté ou suspendu : ses logements ne peuvent pas être publiés.',
          409
        )
      }
    }

    const updated = await this.repo.update(
      id,
      publish
        ? { status: 'published', visibility: { is_public: true, published_at: new Date() } }
        : { status: 'draft', visibility: { is_public: false } }
    )
    if (!updated) {
      throw new DomainError('property_not_found', 'Logement introuvable.', 404)
    }
    return updated
  }
}

export default SetPropertyVisibilityAsAdminUseCase
