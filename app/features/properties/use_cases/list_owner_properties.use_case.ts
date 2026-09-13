import type { ListPropertiesFilters, ListPropertiesOutput } from '../dto/property.dto.ts'
import PropertyRepository from '../repositories/property_repository.ts'

export class ListOwnerPropertiesUseCase {
  constructor(private repo: PropertyRepository = new PropertyRepository()) {}

  async execute(
    owner_id: string,
    filters: Omit<ListPropertiesFilters, 'owner_id'> = {}
  ): Promise<ListPropertiesOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({
      ...filters,
      owner_id,
    })
    return {
      data,
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListOwnerPropertiesUseCase
