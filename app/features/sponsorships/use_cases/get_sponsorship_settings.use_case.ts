import type { SponsorshipSettingsDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

export class GetSponsorshipSettingsUseCase {
  constructor(private repo: SponsorshipRepository = new SponsorshipRepository()) {}

  execute(): Promise<SponsorshipSettingsDto> {
    return this.repo.settings()
  }
}

export default GetSponsorshipSettingsUseCase
