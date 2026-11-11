import { DomainError } from '#utils/domain_error'

import { activeCommissionRule } from '#features/commissions/commission_rules'
import CommissionRepository from '#features/commissions/repositories/commission_repository'

import { isPublicProperty, toPublicProperty, type PublicPropertyDto } from '../public_property.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class FindPublicPropertyUseCase {
  constructor(
    private repo: PropertyRepository = new PropertyRepository(),
    private commissions: Pick<CommissionRepository, 'settings'> = new CommissionRepository()
  ) {}

  async execute(id: string): Promise<PublicPropertyDto> {
    const property = await this.repo.findById(id)

    if (!property) {
      throw new DomainError('property_not_found', 'Propriété introuvable.', 404)
    }
    if (!isPublicProperty(property)) {
      throw new DomainError(
        'property_not_public',
        'Cette propriété n’est pas disponible publiquement.',
        403
      )
    }

    await this.repo.incrementViews(id)
    return toPublicProperty(property, activeCommissionRule(await this.commissions.settings()))
  }
}

export default FindPublicPropertyUseCase
