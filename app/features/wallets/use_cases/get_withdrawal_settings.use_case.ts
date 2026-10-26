import type { WithdrawalSettingsDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

/** Réglages des retraits, lus par le backoffice. */
export class GetWithdrawalSettingsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  execute(): Promise<WithdrawalSettingsDto> {
    return this.repo.withdrawalSettings()
  }
}

export default GetWithdrawalSettingsUseCase
