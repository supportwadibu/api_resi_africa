import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import type { AdminSponsorshipDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

/**
 * Annule le gain d'un filleul — fraude constatée, faux compte. Un gain déjà
 * disponible est repris sur le solde du parrain.
 */
export class CancelSponsorshipRewardUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(id: string, adminId: string, reason: string): Promise<AdminSponsorshipDto> {
    const result = await Sponsorship.cancel(id, {
      reason,
      cancelled_by: adminId,
      now: new Date(),
    })
    if (!result) throw new DomainError('sponsorship_not_found', 'Parrainage introuvable.', 404)
    if (!result.changed) {
      throw new DomainError('sponsorship_already_cancelled', 'Ce parrainage est déjà annulé.', 409)
    }

    const [dto] = await this.repo.toAdminSponsorshipDtos([result.record])
    return dto
  }
}

export default CancelSponsorshipRewardUseCase
