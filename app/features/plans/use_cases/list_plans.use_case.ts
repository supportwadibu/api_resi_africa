import type { ListPlansInput, ListPlansOutput } from '../dto/plan.dto.ts'
import PlanRepository from '../repositories/plan_repository.ts'

export class ListPlansUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) {}

  async execute(input: ListPlansInput): Promise<ListPlansOutput> {
    const { data, total, page, perPage } = await this.repo.paginate(input)
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

export default ListPlansUseCase
