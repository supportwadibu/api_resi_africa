import type { ListResidencesInput, ListResidencesOutput } from '../dto/residence.dto.ts'
import ResidenceRepository from '../repositories/residence_repository.ts'

export class ListOwnerResidencesUseCase {
  constructor(private repo: ResidenceRepository = new ResidenceRepository()) {}

  async execute(owner_id: string, input: ListResidencesInput = {}): Promise<ListResidencesOutput> {
    const { data, total, page, perPage } = await this.repo.paginate(owner_id, input)

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

export default ListOwnerResidencesUseCase
