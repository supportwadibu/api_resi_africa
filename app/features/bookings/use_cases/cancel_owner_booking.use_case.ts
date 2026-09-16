import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto, CancelBookingInput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Annule une réservation du côté du propriétaire.
 *
 * Distinct de `CancelBookingUseCase`, qui sert le flux en ligne : celui-ci est
 * cadré sur `client_id` — le client annule *sa* réservation — et ne peut donc
 * pas servir une saisie comptoir, dont le client n'est pas l'appelant. Les
 * cadrer tous deux sur l'identifiant de l'appelant serait une confusion : le
 * `client_id` d'une réservation comptoir désigne une fiche du carnet, pas un
 * compte connecté.
 *
 * Un séjour déjà clôturé n'est pas annulable : son revenu est constaté, et le
 * revenir dessus réécrirait un mois clos. Le correctif est un avoir, pas une
 * annulation rétroactive — même arbitrage que `buildCheckOutPatch`.
 */
export class CancelOwnerBookingUseCase {
  async execute(id: string, ownerId: string, input: CancelBookingInput = {}): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    if (booking.status === 'cancelled') {
      throw new DomainError('booking_already_cancelled', 'Réservation déjà annulée.', 409)
    }

    if (booking.status === 'completed') {
      throw new DomainError(
        'booking_already_completed',
        'Séjour déjà clôturé : il ne peut plus être annulé.',
        409
      )
    }

    const updated = await Booking.findOneAndUpdate(
      id,
      {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancellation_reason: input.reason ?? null,
      },
      { owner_id: ownerId }
    )

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    // Le bien redevient disponible : une réservation annulée ne doit pas
    // continuer de bloquer le calendrier.
    await new BookingRepository().markPropertyAsAvailable(booking.property_id)

    return BookingRepository.toDto(updated)
  }
}

export default CancelOwnerBookingUseCase
