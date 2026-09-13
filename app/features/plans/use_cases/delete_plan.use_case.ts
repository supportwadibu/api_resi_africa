import { DomainError } from '#utils/domain_error'

import PlanRepository from '../repositories/plan_repository.ts'

export class DeletePlanUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) {}

  async execute(id: string): Promise<void> {
    const deleted = await this.repo.delete(id)
    if (!deleted) {
      throw new DomainError('plan_not_found', 'Plan introuvable.', 404)
    }
  }
}

export default DeletePlanUseCase
