import type { PayoutSettingsDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { WITHDRAWAL_FEE_RATE } from '../wallet_rules.ts'

/** Minimum, frais et numéros Wave enregistrés : l'écran de retrait du propriétaire. */
export class GetPayoutSettingsUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(ownerId: string): Promise<PayoutSettingsDto> {
    const [numbers, settings] = await Promise.all([
      this.repo.payoutNumbers(ownerId),
      this.repo.withdrawalSettings(),
    ])
    return {
      minimum_withdrawal: settings.minimum_amount,
      fee_rate: WITHDRAWAL_FEE_RATE,
      numbers,
    }
  }
}

export default GetPayoutSettingsUseCase
