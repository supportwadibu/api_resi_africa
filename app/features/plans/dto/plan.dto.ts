import type { PlanTier } from '#features/plans/plan_tier'

/**
 * DTO d'entrée/sortie pour les usecases Plan.
 * Le format de retour est volontairement primitivisé (number au lieu de Decimal128)
 * afin d'être directement sérialisable JSON.
 */

export interface PlanDto {
  id: string
  name: string
  description: string
  price: number
  duration_days: number
  max_residences: number
  features: string[]
  tier: PlanTier
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export interface CreatePlanInput {
  name: string
  description?: string
  price: number
  duration_days: number
  max_residences: number
  features?: string[]
  tier: PlanTier
  is_active?: boolean
}

export interface UpdatePlanInput {
  name?: string
  description?: string
  price?: number
  duration_days?: number
  max_residences?: number
  features?: string[]
  tier?: PlanTier
  is_active?: boolean
}

export interface ListPlansInput {
  is_active?: boolean
  page?: number
  per_page?: number
}

export interface ListPlansOutput {
  data: PlanDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
