import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'

import type {
  AdminWithdrawalDto,
  ListWithdrawalsInput,
  PaginatedOutput,
} from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { pageWindow } from './pagination.ts'

export class ListAdminWithdrawalsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(input: ListWithdrawalsInput): Promise<PaginatedOutput<AdminWithdrawalDto>> {
    const { data, total } = await this.repo.adminWithdrawals(
      { status: input.status },
      pageWindow(input)
    )
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListAdminWithdrawalsUseCase
