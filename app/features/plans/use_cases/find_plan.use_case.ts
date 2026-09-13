import { DomainError } from '#utils/domain_error'

import type { PlanDto } from '../dto/plan.dto.ts'
import PlanRepository from '../repositories/plan_repository.ts'

export class FindPlanUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) {}

  async execute(id: string): Promise<PlanDto> {
    const plan = await this.repo.findById(id)
    if (!plan) {
      throw new DomainError('plan_not_found', 'Plan introuvable.', 404)
    }
    return plan
  }
}

export default FindPlanUseCase
