import { DomainError } from '#utils/domain_error'

import type { PlatformBookingDto } from '../dto/platform_booking.dto.ts'
import { attachBookingRelations } from '../platform_booking.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import {
  defaultBookingRelationsSources,
  loadBookingRelations,
  type BookingRelationsSources,
} from './load_booking_relations.ts'

/** Fiche d'une réservation pour le back-office, quel que soit son propriétaire. */
export class FindPlatformBookingUseCase {
  constructor(
    private bookings: BookingRepository = new BookingRepository(),
    private sources: BookingRelationsSources = defaultBookingRelationsSources()
  ) {}

  async execute(id: string): Promise<PlatformBookingDto> {
    const booking = await this.bookings.findById(id)
    if (!booking) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const relations = await loadBookingRelations([booking], this.sources)
    return attachBookingRelations([booking], relations)[0]
  }
}

export default FindPlatformBookingUseCase
