import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { pageWindow } from '#features/wallets/use_cases/pagination'
import type { SponsorshipStatus } from '#models/sponsorship'

import type { AdminSponsorshipDto, PaginatedOutput } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

/** Parrainages vus par l'équipe, filleul et parrain joints. */
export class ListAdminSponsorshipsUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(input: {
    status?: SponsorshipStatus
    sponsor_id?: string
    page?: number
    per_page?: number
  }): Promise<PaginatedOutput<AdminSponsorshipDto>> {
    const { data, total } = await this.repo.adminSponsorships(
      { status: input.status, sponsor_id: input.sponsor_id },
      pageWindow(input)
    )
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListAdminSponsorshipsUseCase
