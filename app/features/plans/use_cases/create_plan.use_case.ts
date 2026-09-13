/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  CreatePlanInput,
  PlanDto,
} from '../dto/plan.dto.ts'
import PlanRepository from '../repositories/plan_repository.ts'

export class CreatePlanUseCase {
  constructor(private repo: PlanRepository = new PlanRepository()) { }

  async execute(input: CreatePlanInput): Promise<PlanDto> {
    if (input.price < 0) {
      throw new DomainError(
        'invalid_price',
        'Le prix doit être positif.',
        422,
      )
    }

    const existing = await this.repo.findByName(input.name)
    if (existing) {
      throw new DomainError(
        'plan_already_exists',
        'Un plan avec ce nom existe déjà.',
        409,
      )
    }

    return this.repo.create(input)
  }
}

export default CreatePlanUseCase
