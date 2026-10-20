import Wallet from '#models/wallet'
import { DomainError } from '#utils/domain_error'

import type { AdminWithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

/**
 * Clôt une demande de retrait : versée par l'équipe, ou refusée — le montant
 * revient alors au portefeuille.
 */
export class ResolveWithdrawalUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(
    id: string,
    adminId: string,
    input:
      | { status: 'paid'; payout_reference?: string | null }
      | { status: 'rejected'; rejection_reason: string }
  ): Promise<AdminWithdrawalDto> {
    const result = await Wallet.resolveWithdrawal(id, {
      status: input.status,
      processed_by: adminId,
      payout_reference: input.status === 'paid' ? (input.payout_reference ?? null) : null,
      rejection_reason: input.status === 'rejected' ? input.rejection_reason : null,
    })

    if (!result) {
      throw new DomainError('withdrawal_not_found', 'Demande de retrait introuvable.', 404)
    }
    if (!result.changed) {
      throw new DomainError(
        'withdrawal_already_processed',
        'Cette demande de retrait a déjà été traitée.',
        409
      )
    }

    const [dto] = await this.repo.toAdminDtos([result.request])
    return dto
  }
}

export default ResolveWithdrawalUseCase
