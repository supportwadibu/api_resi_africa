/* eslint-disable prettier/prettier */
import Property from '#models/property'

import type {
  BookingDto,
  BookingPropertySummary,
  ListBookingsInput,
  ListBookingsOutput,
} from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export class ListOwnerBookingsUseCase {
  constructor(private repo: BookingRepository = new BookingRepository()) { }

  async execute(
    owner_id: string,
    input: Omit<ListBookingsInput, 'owner_id'> = {}
  ): Promise<ListBookingsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({ ...input, owner_id })

    return {
      data: await this.withProperties(data),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }

  /**
   * Joint à chaque réservation le résumé de son bien.
   *
   * Les identifiants sont dédoublonnés avant lecture : plusieurs réservations
   * portent souvent sur le même logement, et Firestore facture chaque lecture.
   * Un bien supprimé depuis laisse simplement le résumé absent, sans faire
   * échouer la liste entière.
   */
  private async withProperties(bookings: BookingDto[]): Promise<BookingDto[]> {
    const ids = [...new Set(bookings.map((booking) => booking.property_id).filter(Boolean))]
    if (ids.length === 0) return bookings

    const summaries = new Map<string, BookingPropertySummary>()

    await Promise.all(
      ids.map(async (id) => {
        const property = await Property.findById(id)
        if (!property) return

        summaries.set(id, {
          id: property._id,
          title: property.title,
          city: property.address?.city ?? '',
          image: property.media?.images?.[0] ?? null,
        })
      })
    )

    return bookings.map((booking) => {
      const property = summaries.get(booking.property_id)
      return property ? { ...booking, property } : booking
    })
  }
}

export default ListOwnerBookingsUseCase
