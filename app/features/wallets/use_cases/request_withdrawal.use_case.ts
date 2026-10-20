import Wallet from '#models/wallet'
import { normalizePhone } from '#models/client'
import { DomainError } from '#utils/domain_error'

import type { RequestWithdrawalInput, WithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { quoteWithdrawal } from '../wallet_rules.ts'

/** Demande de retrait : le montant est débité aussitôt, versé par l'équipe. */
export class RequestWithdrawalUseCase {
  async execute(input: RequestWithdrawalInput): Promise<WithdrawalDto> {
    const request = await Wallet.requestWithdrawal({
      wallet_id: input.wallet_id,
      owner_id: input.owner_id,
      payout_phone: normalizePhone(input.payout_phone),
      payout_name: input.payout_name?.trim() || null,
      quote: (balance) => quoteWithdrawal(input.amount, balance),
    })

    if (!request) {
      throw new DomainError('wallet_not_found', 'Portefeuille introuvable.', 404)
    }

    return WalletRepository.toWithdrawalDto(request)
  }
}

export default RequestWithdrawalUseCase
