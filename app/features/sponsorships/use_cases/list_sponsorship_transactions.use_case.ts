import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { pageWindow } from '#features/wallets/use_cases/pagination'

import type { PaginatedOutput, SponsorshipTransactionDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

/** Journal des gains et de leurs usages. */
export class ListSponsorshipTransactionsUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(
    userId: string,
    input: { page?: number; per_page?: number }
  ): Promise<PaginatedOutput<SponsorshipTransactionDto>> {
    const { data, total } = await this.repo.transactions(userId, pageWindow(input))
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListSponsorshipTransactionsUseCase
