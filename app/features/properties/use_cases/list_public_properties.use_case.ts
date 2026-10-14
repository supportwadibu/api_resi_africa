import type { ListPropertiesFilters, ListPropertiesOutput } from '../dto/property.dto.ts'
import { toPublicProperty, type PublicPropertyDto } from '../public_property.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class ListPublicPropertiesUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(
    filters: ListPropertiesFilters = {}
  ): Promise<Omit<ListPropertiesOutput, 'data'> & { data: PublicPropertyDto[] }> {
    const { data, total, page, perPage } = await this.repo.paginate({
      ...filters,
      status: filters.status ?? 'published',
      is_public: true,
    })
    return {
      data: data.map(toPublicProperty),
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
