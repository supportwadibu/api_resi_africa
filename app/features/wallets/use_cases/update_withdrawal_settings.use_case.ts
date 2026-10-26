import type { WithdrawalSettingsDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

/** Change le retrait minimal ; il vaut pour les demandes suivantes. */
export class UpdateWithdrawalSettingsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  execute(input: { minimum_amount: number }, adminId: string): Promise<WithdrawalSettingsDto> {
    return this.repo.updateWithdrawalSettings(input.minimum_amount, adminId)
  }
}

export default UpdateWithdrawalSettingsUseCase
