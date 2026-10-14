import { isPublicProperty } from '#features/properties/public_property'
import PropertyRepository from '#features/properties/repositories/property_repository'
import { DomainError } from '#utils/domain_error'

import { ACTIVE_BOOKING_STATUSES, toPeriods } from '../availability.ts'
import BookingRepository from '../repositories/booking_repository.ts'

export interface PublicPeriodDto {
  start: Date
  end: Date
}

/** Lectures du use case, injectables pour les tests unitaires. */
export interface PublicAvailabilitySources {
  findProperty(id: string): Promise<{ status: string; visibility?: { is_public?: boolean } } | null>
  findActiveBookings(
    propertyId: string,
    from: Date
  ): Promise<
    Array<{
      _id?: string
      status: string
      start_date: Date
      end_date: Date
      check_in_at?: Date
      check_out_at?: Date
    }>
  >
}

// Par les repositories : ni use case ni contrôleur ne touchent Firestore.
const defaultSources: PublicAvailabilitySources = {
  findProperty: (id) => new PropertyRepository().findById(id),
  findActiveBookings: (propertyId, from) =>
    new BookingRepository().findActiveForProperty(propertyId, from),
}

/**
 * Périodes occupées d'une résidence publiée, pour barrer les dates du
 * calendrier de l'app client.
 *
 * Réduites à leurs bornes : la route est publique, et ni l'identifiant d'une
 * réservation ni le nom de son client n'ont à en sortir.
 */
export class GetPublicAvailabilityUseCase {
  constructor(private sources: PublicAvailabilitySources = defaultSources) {}

  async execute(propertyId: string, from: Date = new Date()): Promise<PublicPeriodDto[]> {
    const property = await this.sources.findProperty(propertyId)
    // Même réponse pour une résidence inconnue et pour une résidence non
    // publiée : la distinguer révélerait l'existence d'un brouillon.
    if (!property || !isPublicProperty(property)) {
      throw new DomainError('property_not_found', 'Résidence introuvable.', 404)
    }

    const blocking = ACTIVE_BOOKING_STATUSES as readonly string[]
    const bookings = await this.sources.findActiveBookings(propertyId, from)

    return toPeriods(bookings)
      .filter((period) => blocking.includes(period.status))
      .map((period) => ({ start: period.check_in_at, end: period.check_out_at }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }
}

export default GetPublicAvailabilityUseCase
