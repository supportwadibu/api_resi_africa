import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { DomainError } from '#utils/domain_error'

import type { PaginatedOutput, WalletTransactionDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { pageWindow } from './pagination.ts'

/** Mouvements d'un portefeuille du propriétaire, du plus récent au plus ancien. */
export class ListWalletTransactionsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(
    walletId: string,
    ownerId: string,
    input: { page?: number; per_page?: number }
  ): Promise<PaginatedOutput<WalletTransactionDto>> {
    const wallet = await this.repo.findForOwner(walletId, ownerId)
    if (!wallet) {
      throw new DomainError('wallet_not_found', 'Portefeuille introuvable.', 404)
    }

    const { data, total } = await this.repo.transactions(walletId, pageWindow(input))
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListWalletTransactionsUseCase
