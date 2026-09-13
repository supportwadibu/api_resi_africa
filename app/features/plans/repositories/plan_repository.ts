/* eslint-disable prettier/prettier */
import Plan, { type PlanRecord } from '#models/plan'

import type {
  CreatePlanInput,
  ListPlansInput,
  PlanDto,
  UpdatePlanInput,
} from '../dto/plan.dto.ts'

export class PlanRepository {
  static toDto(doc: PlanRecord): PlanDto {
    return {
      id: doc._id,
      name: doc.name,
      description: doc.description ?? '',
      price: doc.price,
      duration_days: doc.duration_days,
      max_residences: doc.max_residences,
      features: [...(doc.features ?? [])],
      is_active: doc.is_active,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async create(input: CreatePlanInput): Promise<PlanDto> {
    const doc = await Plan.create({
      name: input.name,
      description: input.description ?? '',
      price: input.price,
      duration_days: input.duration_days,
      max_residences: input.max_residences,
      features: input.features ?? [],
      is_active: input.is_active ?? true,
    })
    return PlanRepository.toDto(doc)
  }

  async findById(id: string): Promise<PlanDto | null> {
    const doc = await Plan.findById(id)
    return doc ? PlanRepository.toDto(doc) : null
  }

  async findByName(name: string): Promise<PlanDto | null> {
    const doc = await Plan.findOne({ name })
    return doc ? PlanRepository.toDto(doc) : null
  }

  async update(id: string, input: UpdatePlanInput): Promise<PlanDto | null> {
    const doc = await Plan.findByIdAndUpdate(id, { ...input })
    return doc ? PlanRepository.toDto(doc) : null
  }

  async delete(id: string): Promise<boolean> {
    return Plan.deleteOne(id)
  }

  async paginate(input: ListPlansInput): Promise<{
    data: PlanDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await Plan.paginate({
      isActive: typeof input.is_active === 'boolean' ? input.is_active : undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    })

    return {
      data: data.map((d) => PlanRepository.toDto(d)),
      total,
      page,
      perPage,
    }
  }
}

export default PlanRepository
