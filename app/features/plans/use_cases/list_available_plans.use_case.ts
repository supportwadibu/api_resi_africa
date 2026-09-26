import type { PlanDto } from '../dto/plan.dto.ts'
import PlanRepository from '../repositories/plan_repository.ts'

/** Forfaits proposés au propriétaire, du moins cher au plus cher. */
export class ListAvailablePlansUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) {}

  async execute(): Promise<PlanDto[]> {
    return this.repo.listActive()
  }
}

export default ListAvailablePlansUseCase
