/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  BookingDto,
  CancelBookingInput,
} from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class CancelBookingUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) { }

  async execute(
    id: string,
    client_id: string,
    input: CancelBookingInput = {}
  ): Promise<BookingDto> {
    const current = await this.repo.findById(id)
    if (!current || current.client_id !== client_id || current.status !== 'confirmed') {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const booking = await this.repo.updateStatus(
      id,
      'cancelled',
      { cancelled_at: new Date(), cancellation_reason: input.reason ?? null },
      { client_id }
    )
    if (!booking) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }
    await this.repo.markPropertyAsAvailable(current.property_id)
    return booking
  }
}

export default CancelBookingUseCase
