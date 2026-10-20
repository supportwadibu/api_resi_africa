import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto, CancelBookingInput } from '../dto/booking.dto.ts'
import { buildCancellationPatch } from '../cancellation.ts'
import { syncReferrerCommissionExpense } from '../referrer_expense.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Annule une réservation du côté du propriétaire ou de son gérant.
 *
 * Distinct de `CancelBookingUseCase`, qui sert le flux en ligne : celui-ci est
 * cadré sur `client_id` — le client annule *sa* réservation — et ne peut donc
 * pas servir une saisie comptoir, dont le client n'est pas l'appelant. Les
 * cadrer tous deux sur l'identifiant de l'appelant serait une confusion : le
 * `client_id` d'une réservation comptoir désigne une fiche du carnet, pas un
 * compte connecté.
 *
 * Règles d'annulation et sort de l'acompte : voir `buildCancellationPatch`.
 */
export class CancelOwnerBookingUseCase {
  async execute(id: string, ownerId: string, input: CancelBookingInput = {}): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const updated = await Booking.findOneAndUpdate(
      id,
      { ...buildCancellationPatch(booking, input) },
      {
        owner_id: ownerId,
      }
    )

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Le bien redevient disponible : une réservation annulée ne doit pas
    // continuer de bloquer le calendrier.
    await new BookingRepository().markPropertyAsAvailable(booking.property_id)
    // Une commission ne survit pas à l'annulation : son reflet est retiré.
    await syncReferrerCommissionExpense(updated)

    return BookingRepository.toDto(updated)
  }
}

export default CancelOwnerBookingUseCase
