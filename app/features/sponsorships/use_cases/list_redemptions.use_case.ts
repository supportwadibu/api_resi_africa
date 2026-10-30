import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { pageWindow } from '#features/wallets/use_cases/pagination'
import type { RedemptionStatus } from '#models/sponsorship'

import type { AdminRedemptionDto, PaginatedOutput, RedemptionDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import type { RedemptionType } from '../sponsorship_rules.ts'

interface ListInput {
  status?: RedemptionStatus
  type?: RedemptionType
  page?: number
  per_page?: number
}

/** Retraits et conversions : ceux du parrain, ou tous pour l'équipe. */
export class ListRedemptionsUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async forUser(userId: string, input: ListInput): Promise<PaginatedOutput<RedemptionDto>> {
    const { data, total } = await this.repo.redemptions(
      { user_id: userId, status: input.status, type: input.type },
      pageWindow(input)
    )
    return { data, meta: buildPaginationMeta(total, input) }
  }

  async forAdmin(input: ListInput): Promise<PaginatedOutput<AdminRedemptionDto>> {
    const { data, total } = await this.repo.adminRedemptions(
      { status: input.status, type: input.type },
      pageWindow(input)
    )
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListRedemptionsUseCase
