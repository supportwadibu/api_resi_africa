import Wallet from '#models/wallet'
import { DomainError } from '#utils/domain_error'

import type { AdminWithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

/**
 * Clôt une demande de retrait : versée par l'équipe, ou refusée — le montant
 * revient alors au portefeuille.
 *
 * Le versement reste manuel : l'équipe envoie l'argent depuis Wave Business,
 * puis saisit ici l'identifiant de la transaction. Une même référence ne clôt
 * jamais deux demandes — un copier-coller resté dans le presse-papiers
 * fermerait une demande que personne n'a payée.
 */
export class ResolveWithdrawalUseCase {
  constructor(
    private repo: Pick<WalletRepository, 'toAdminDtos'> = new WalletRepository(),
    private wallets: Pick<
      typeof Wallet,
      'resolveWithdrawal' | 'findWithdrawalByPayoutReference'
    > = Wallet
  ) {}

  async execute(
    id: string,
    adminId: string,
    input:
      | { status: 'paid'; payout_reference: string }
      | { status: 'rejected'; rejection_reason: string }
  ): Promise<AdminWithdrawalDto> {
    // Les identifiants Wave s'affichent en majuscules : la casse saisie ne
    // doit pas faire passer un doublon.
    const reference =
      input.status === 'paid' ? normalizePayoutReference(input.payout_reference) : null
    if (reference !== null) {
      const taken = await this.wallets.findWithdrawalByPayoutReference(reference)
      if (taken && taken._id !== id) {
        throw new DomainError(
          'payout_reference_taken',
          'Cette référence Wave a déjà servi pour un autre retrait. Vérifiez le transfert.',
          409
        )
      }
    }

    const result = await this.wallets.resolveWithdrawal(id, {
      status: input.status,
      processed_by: adminId,
      payout_reference: reference,
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

/** Forme canonique d'une référence Wave : sans espaces, en majuscules. */
export function normalizePayoutReference(reference: string): string {
  return reference.replace(/\s+/g, '').toUpperCase()
}

export default ResolveWithdrawalUseCase
