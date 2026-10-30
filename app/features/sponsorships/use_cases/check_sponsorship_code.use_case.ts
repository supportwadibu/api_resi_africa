import Sponsorship from '#models/sponsorship'
import { DomainError } from '#utils/domain_error'

import type { SponsorshipCodeCheckDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import { isSponsorshipRole, normalizeSponsorshipCode } from '../sponsorship_rules.ts'

/**
 * Vérifie un code avant l'inscription, pour que le formulaire dise tout de
 * suite « code inconnu » plutôt que de l'ignorer à la validation de l'OTP.
 */
export class CheckSponsorshipCodeUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(rawCode: string): Promise<SponsorshipCodeCheckDto> {
    const code = normalizeSponsorshipCode(rawCode)
    const sponsorId = code ? await Sponsorship.findCodeOwner(code) : null
    const sponsor = sponsorId ? await this.repo.findUser(sponsorId) : null

    if (!code || !sponsor || !sponsor.is_active || !isSponsorshipRole(sponsor.role_id)) {
      throw new DomainError('invalid_sponsorship_code', 'Ce code de parrainage n’existe pas.', 404)
    }

    return { code, sponsor_first_name: sponsor.full_name.trim().split(/\s+/)[0] ?? '' }
  }
}

export default CheckSponsorshipCodeUseCase
