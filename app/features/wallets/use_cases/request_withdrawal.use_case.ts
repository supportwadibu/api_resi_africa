import Wallet from '#models/wallet'
import { normalizePhone } from '#models/client'
import { DomainError } from '#utils/domain_error'

import type { RequestWithdrawalInput, WithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'
import { quoteWithdrawal } from '../wallet_rules.ts'

/**
 * Demande de retrait : le montant est débité aussitôt, versé par l'équipe sur
 * Wave.
 *
 * Le numéro est l'un de ceux que le propriétaire a enregistrés (`payout_slot`).
 * Le numéro saisi à la main (`payout_phone`) reste admis pour les versions de
 * l'application antérieures aux numéros enregistrés.
 */
export class RequestWithdrawalUseCase {
  constructor(private repo: WalletRepository = new WalletRepository()) {}

  async execute(input: RequestWithdrawalInput): Promise<WithdrawalDto> {
    const [payee, settings] = await Promise.all([
      this.resolvePayee(input),
      this.repo.withdrawalSettings(),
    ])

    const request = await Wallet.requestWithdrawal({
      wallet_id: input.wallet_id,
      owner_id: input.owner_id,
      payout_phone: payee.phone,
      payout_name: payee.name,
      payout_slot: payee.slot,
      quote: (balance, feeFreeBalance) =>
        quoteWithdrawal(input.amount, balance, feeFreeBalance, settings.minimum_amount),
    })

    if (!request) {
      throw new DomainError('wallet_not_found', 'Portefeuille introuvable.', 404)
    }

    return WalletRepository.toWithdrawalDto(request)
  }

  private async resolvePayee(
    input: RequestWithdrawalInput
  ): Promise<{ phone: string; name: string | null; slot: number | null }> {
    if (input.payout_slot !== undefined) {
      const numbers = await this.repo.payoutNumbers(input.owner_id)
      const number = numbers.find((n) => n.slot === input.payout_slot)
      if (!number) {
        throw new DomainError(
          'payout_number_not_found',
          "Ce numéro Wave n'est pas enregistré. Ajoutez-le avant de retirer.",
          422
        )
      }
      return { phone: number.phone, name: number.holder_name, slot: number.slot }
    }

    if (input.payout_phone) {
      return {
        phone: normalizePhone(input.payout_phone),
        name: input.payout_name?.trim() || null,
        slot: null,
      }
    }

    throw new DomainError('payout_number_required', 'Choisissez le numéro Wave à créditer.', 422)
  }
}

export default RequestWithdrawalUseCase
