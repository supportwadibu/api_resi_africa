import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'

import type {
  ListPlatformBookingsInput,
  ListPlatformBookingsOutput,
} from '../dto/platform_booking.dto.ts'
import { attachBookingRelations } from '../platform_booking.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import {
  defaultBookingRelationsSources,
  loadBookingRelations,
  type BookingRelationsSources,
} from './load_booking_relations.ts'

/** Réservations de toute la plateforme, relations jointes. */
export class ListPlatformBookingsUseCase {
  constructor(
    private bookings: BookingRepository = new BookingRepository(),
    private sources: BookingRelationsSources = defaultBookingRelationsSources()
  ) {}

  async execute(input: ListPlatformBookingsInput): Promise<ListPlatformBookingsOutput> {
    const { data, total } = await this.bookings.paginate({
      owner_id: input.owner_id,
      property_id: input.property_id,
      client_id: input.client_id,
      status: input.status,
      page: input.page,
      per_page: input.per_page,
    })

    const relations = await loadBookingRelations(data, this.sources)

    return {
      data: attachBookingRelations(data, relations),
      meta: buildPaginationMeta(total, input),
    }
  }
}

export default ListPlatformBookingsUseCase
