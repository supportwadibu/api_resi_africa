import type { BookingStatsDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class GetBookingStatsUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  async execute(owner_id: string): Promise<BookingStatsDto> {
    return this.repo.stats(owner_id)
  }
}

export default GetBookingStatsUseCase
