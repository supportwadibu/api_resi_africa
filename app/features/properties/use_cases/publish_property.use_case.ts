import { DomainError } from '#utils/domain_error'

import OwnerRepository from '../../owners/repositories/owner_repository.ts'
import type { PropertyDto } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

/**
 * Rend une annonce visible du public.
 *
 * Le dépôt du dossier d'identité est un préalable : une annonce publiée engage
 * des locataires vis-à-vis d'un propriétaire dont l'identité n'aurait jamais
 * été établie. La création et la modification d'un bien restent en revanche
 * libres — un propriétaire peut préparer son catalogue pendant l'examen de son
 * dossier.
 *
 * Le dépôt suffit ici, la validation administrative n'est pas exigée : la
 * refuser bloquerait toute activité pendant l'essai gratuit, que le produit
 * accorde justement pour permettre la prise en main.
 */
export class PublishPropertyUseCase {
  constructor(
    private repo: PropertyRepository = new PropertyRepository(),
    private owners: OwnerRepository = new OwnerRepository()
  ) {}

  async execute(id: string, owner_id: string): Promise<PropertyDto> {
    const owner = await this.owners.findById(owner_id)

    if (owner && !owner.profile_submitted) {
      throw new DomainError(
        'owner_profile_required',
        'Complétez votre dossier (pièce d’identité et coordonnées) avant de publier une annonce.',
        403
      )
    }

    if (owner?.owner_status === 'rejected' || owner?.owner_status === 'suspended') {
      throw new DomainError(
        'owner_not_operational',
        'Votre compte ne permet pas la publication d’annonces. Contactez le support.',
        403
      )
    }

    const updated = await this.repo.update(
      id,
      {
        status: 'published',
        visibility: { is_public: true, published_at: new Date() },
      },
      owner_id
    )
    if (!updated) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    return updated
  }
}

export default PublishPropertyUseCase
