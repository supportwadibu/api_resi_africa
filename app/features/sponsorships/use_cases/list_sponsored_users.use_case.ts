import Sponsorship from '#models/sponsorship'

import type { SponsoredUserDto } from '../dto/sponsorship.dto.ts'
import SponsorshipRepository from '../repositories/sponsorship_repository.ts'

/** Filleuls du parrain et l'étape de chacun, du plus récent au plus ancien. */
export class ListSponsoredUsersUseCase {
  async execute(sponsorId: string): Promise<SponsoredUserDto[]> {
    const records = await Sponsorship.listBySponsor(sponsorId)
    return records.map(SponsorshipRepository.toSponsoredDto)
  }
}

export default ListSponsoredUsersUseCase
