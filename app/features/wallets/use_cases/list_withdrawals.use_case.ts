import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'

import type { ListWithdrawalsInput, PaginatedOutput, WithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { pageWindow } from './pagination.ts'

/** Retraits du propriétaire, ou de toute la plateforme pour l'équipe. */
export class ListWithdrawalsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(input: ListWithdrawalsInput): Promise<PaginatedOutput<WithdrawalDto>> {
    const { data, total } = await this.repo.withdrawals(
      { owner_id: input.owner_id, status: input.status },
      pageWindow(input)
    )
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListWithdrawalsUseCase
