import { activeCommissionRule, ownerDailyPriceFor } from '#features/commissions/commission_rules'
import CommissionRepository from '#features/commissions/repositories/commission_repository'
import { effectiveDepositRule } from '#features/deposits/deposit_rules'
import DepositRepository from '#features/deposits/repositories/deposit_repository'

import type { ListPropertiesFilters, ListPropertiesOutput } from '../dto/property.dto.ts'
import { toPublicProperty, type PublicPropertyDto } from '../public_property.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class ListPublicPropertiesUseCase {
  constructor(
    private repo: PropertyRepository = new PropertyRepository(),
    private commissions: Pick<CommissionRepository, 'settings'> = new CommissionRepository(),
    private deposits: Pick<DepositRepository, 'settings'> = new DepositRepository()
  ) {}

  async execute(
    filters: ListPropertiesFilters = {}
  ): Promise<Omit<ListPropertiesOutput, 'data'> & { data: PublicPropertyDto[] }> {
    const [commission, deposits] = await Promise.all([
      this.commissions.settings(),
      this.deposits.settings(),
    ])
    const rule = activeCommissionRule(commission)
    // Le client filtre sur les prix qu'il voit, commission comprise ; la base
    // ne connaît que ceux du propriétaire.
    const toOwner = (price?: number) =>
      price === undefined ? undefined : ownerDailyPriceFor(price, rule)
    const { data, total, page, perPage } = await this.repo.paginate({
      ...filters,
      min_price: toOwner(filters.min_price),
      max_price: toOwner(filters.max_price),
      status: filters.status ?? 'published',
      is_public: true,
    })
    return {
      data: data.map((property) =>
        toPublicProperty(property, rule, effectiveDepositRule(deposits, property.deposit))
      ),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListPublicPropertiesUseCase
