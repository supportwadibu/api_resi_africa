import type { BookingStatsDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class GetBookingStatsUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  /**
   * `scope_property_ids` restreint les compteurs au périmètre de l'appelant.
   * Absent ou `null`, le chemin du propriétaire est inchangé — c'est le repli
   * qui rend le paramètre facultatif, et c'est aussi son piège : un contrôleur
   * de gérant qui l'oublie compile et sert tout le parc. Un test assure donc
   * sur l'argument réellement transmis.
   */
  async execute(
    owner_id: string,
    scope_property_ids: string[] | null = null
  ): Promise<BookingStatsDto> {
    return this.repo.stats(owner_id, new Date(), scope_property_ids)
  }
}

export default GetBookingStatsUseCase
