import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import { ACTIVE_BOOKING_STATUSES } from '../availability.ts'

export interface OccupiedPeriodDto {
  booking_id: string
  check_in_at: Date
  check_out_at: Date
  status: string
  client_name: string | null
}

/**
 * Périodes pendant lesquelles un bien est immobilisé.
 *
 * Alimente le calendrier de saisie : le propriétaire doit voir les dates déjà
 * prises avant de proposer un séjour, plutôt que d'essuyer un refus après
 * avoir tout saisi.
 */
export class GetAvailabilityUseCase {
  async execute(
    ownerId: string,
    propertyId: string,
    range: { from?: Date; to?: Date } = {}
  ): Promise<OccupiedPeriodDto[]> {
    const property = await Property.findById(propertyId)
    if (!property || property.owner_id !== ownerId) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const from = range.from ?? new Date()
    const bookings = await Booking.findActiveForProperty(propertyId, from)
    const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]

    return bookings
      .filter((doc) => blocking.includes(doc.status))
      .filter((doc) => !range.to || (doc.check_in_at ?? doc.start_date) < range.to)
      .map((doc) => ({
        booking_id: doc._id,
        check_in_at: doc.check_in_at ?? doc.start_date,
        check_out_at: doc.check_out_at ?? doc.end_date,
        status: doc.status,
        client_name: doc.client_snapshot?.full_name ?? null,
      }))
      .sort((a, b) => a.check_in_at.getTime() - b.check_in_at.getTime())
  }
}

export default GetAvailabilityUseCase
