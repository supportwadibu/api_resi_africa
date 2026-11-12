import { DomainError } from '#utils/domain_error'

import { activeCommissionRule } from '#features/commissions/commission_rules'
import CommissionRepository from '#features/commissions/repositories/commission_repository'
import { effectiveDepositRule } from '#features/deposits/deposit_rules'
import DepositRepository from '#features/deposits/repositories/deposit_repository'

import { isPublicProperty, toPublicProperty, type PublicPropertyDto } from '../public_property.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class FindPublicPropertyUseCase {
  constructor(
    private repo: PropertyRepository = new PropertyRepository(),
    private commissions: Pick<CommissionRepository, 'settings'> = new CommissionRepository(),
    private deposits: Pick<DepositRepository, 'settings'> = new DepositRepository()
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
    const [commission, deposit] = await Promise.all([
      this.commissions.settings(),
      this.deposits.settings(),
    ])
    return toPublicProperty(
      property,
      activeCommissionRule(commission),
      effectiveDepositRule(deposit, property.deposit)
    )
  }
}

export default FindPublicPropertyUseCase
