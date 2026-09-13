/* eslint-disable prettier/prettier */
import type {
  ListBookingsInput,
  ListBookingsOutput,
} from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class ListClientBookingsUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) {}

  async execute(
    client_id: string,
    input: Omit<ListBookingsInput, 'client_id'> = {}
  ): Promise<ListBookingsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({ ...input, client_id })
    return {
      data,
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListClientBookingsUseCase
