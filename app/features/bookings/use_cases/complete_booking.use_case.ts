import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class CompleteBookingUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  async execute(id: string, owner_id: string): Promise<BookingDto> {
    const booking = await this.repo.updateStatus(
      id,
      'completed',
      { completed_at: new Date() },
      { owner_id }
    )
    if (!booking) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }
    return booking
  }
}

export default CompleteBookingUseCase
