import { DomainError } from '#utils/domain_error'

import type { SponsorshipSettingsDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import type { SponsorshipSettings } from '../sponsorship_rules.ts'

/**
 * Remplace les réglages en entier. Valent aussitôt pour les gains à venir ;
 * ceux déjà acquis gardent la règle figée à leur attribution.
 */
export class UpdateSponsorshipSettingsUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  async execute(input: SponsorshipSettings, adminId: string): Promise<SponsorshipSettingsDto> {
    for (const role of ['client', 'proprio'] as const) {
      const rule = input.rewards[role]
      if (rule.mode === 'percent' && rule.value > 100) {
        throw new DomainError(
          'invalid_sponsorship_settings',
          'Un gain en pourcentage ne peut pas dépasser 100 %.',
          422
        )
      }
    }
    return this.repo.updateSettings(input, adminId)
  }
}

export default UpdateSponsorshipSettingsUseCase
