import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Détail d'une réservation, restreint à son propriétaire.
 *
 * Le cadrage sur `owner_id` est le contrôle qui porte la confidentialité : sans
 * lui, un identifiant deviné rendrait la réservation d'un autre compte. Le
 * périmètre d'un gérant se vérifie **en plus**, dans le contrôleur, sur le
 * logement de la réservation lue.
 */
export class FindOwnerBookingUseCase {
  async execute(id: string, ownerId: string): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return BookingRepository.toDto(booking)
  }
}

export default FindOwnerBookingUseCase
