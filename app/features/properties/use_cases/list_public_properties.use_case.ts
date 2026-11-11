import { activeCommissionRule, ownerDailyPriceFor } from '#features/commissions/commission_rules'
import CommissionRepository from '#features/commissions/repositories/commission_repository'

import type { ListPropertiesFilters, ListPropertiesOutput } from '../dto/property.dto.ts'
import { toPublicProperty, type PublicPropertyDto } from '../public_property.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class ListPublicPropertiesUseCase {
  constructor(
    private repo: PropertyRepository = new PropertyRepository(),
    private commissions: Pick<CommissionRepository, 'settings'> = new CommissionRepository()
  ) {}

  async execute(
    filters: ListPropertiesFilters = {}
  ): Promise<Omit<ListPropertiesOutput, 'data'> & { data: PublicPropertyDto[] }> {
    const rule = activeCommissionRule(await this.commissions.settings())
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
      data: data.map((property) => toPublicProperty(property, rule)),
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
