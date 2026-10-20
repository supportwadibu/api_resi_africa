import Wallet from '#models/wallet'
import { DomainError } from '#utils/domain_error'

import type { AdminWithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

export class GetAdminWithdrawalUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(id: string): Promise<AdminWithdrawalDto> {
    const request = await Wallet.findWithdrawalById(id)
    if (!request) {
      throw new DomainError('withdrawal_not_found', 'Demande de retrait introuvable.', 404)
    }
    const [dto] = await this.repo.toAdminDtos([request])
    return dto
  }
}

export default GetAdminWithdrawalUseCase
