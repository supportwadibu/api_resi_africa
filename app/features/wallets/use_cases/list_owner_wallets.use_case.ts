import WalletRepository from '../repositories/wallet_repository.ts'

import type { WalletDto } from '../dto/wallet.dto.ts'
/** Portefeuilles du propriétaire. */
export class ListOwnerWalletsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  execute(ownerId: string): Promise<WalletDto[]> {
    return this.repo.listForOwner(ownerId)
  }
}

export default ListOwnerWalletsUseCase
