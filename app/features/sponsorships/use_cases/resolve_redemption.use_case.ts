import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import type { AdminRedemptionDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

/**
 * Clôt un retrait de gains : versé par l'équipe sur Wave, ou refusé — le
 * montant revient alors au solde du parrain.
 */
export class ResolveRedemptionUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(
    id: string,
    adminId: string,
    input:
      | { status: 'paid'; payout_reference?: string | null }
      | { status: 'rejected'; rejection_reason: string }
  ): Promise<AdminRedemptionDto> {
    const result = await Sponsorship.resolveRedemption(id, {
      status: input.status,
      processed_by: adminId,
      payout_reference: input.status === 'paid' ? (input.payout_reference ?? null) : null,
      rejection_reason: input.status === 'rejected' ? input.rejection_reason : null,
      now: new Date(),
    })
    if (!result) {
      throw new DomainError('redemption_not_found', 'Demande de retrait introuvable.', 404)
    }
    if (!result.changed) {
      throw new DomainError(
        'redemption_already_processed',
        'Cette demande de retrait a déjà été traitée.',
        409
      )
    }

    const [dto] = await this.repo.toAdminRedemptionDtos([result.record])
    return dto
  }
}

export default ResolveRedemptionUseCase
