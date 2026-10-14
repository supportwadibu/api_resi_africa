import { DomainError } from '#utils/domain_error'

import type { PlanDto, UpdatePlanInput } from '../dto/plan.dto.ts'
import PlanRepository from '../repositories/plan_repository.ts'

export class UpdatePlanUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) {}

  async execute(id: string, input: UpdatePlanInput): Promise<PlanDto> {
    if (input.price !== undefined && input.price < 0) {
      throw new DomainError('invalid_price', 'Le prix doit être positif.', 422)
    }

    if (input.name) {
      const existing = await this.repo.findByName(input.name)
      if (existing && existing.id !== id) {
        throw new DomainError('plan_already_exists', 'Un autre plan porte déjà ce nom.', 409)
      }
    }

    const updated = await this.repo.update(id, input)
    if (!updated) {
      throw new DomainError('plan_not_found', 'Plan introuvable.', 404)
    }
    return updated
  }
}

export default UpdatePlanUseCase
