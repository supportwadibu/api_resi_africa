import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import { withReferrerCommission } from '../referrer.ts'

/**
 * Champs écrits par un encaissement au comptoir.
 *
 * Extraite pour être éprouvée sans Firestore : c'est un calcul d'argent, et
 * c'est le genre de composition où un champ omis ne se voit pas.
 *
 * `total_amount` suit `received_amount` : Finance lit le premier pour le
 * chiffre d'affaires constaté, et les laisser diverger ferait apparaître
 * l'encaissement dans la fiche sans qu'il n'entre jamais dans les totaux.
 *
 * `discount_amount` est recalculé et non cumulé : l'écart entre attendu et
 * encaissé est une remise consentie, même règle qu'à la création comptoir et
 * qu'à la prolongation. L'incrémenter ferait dériver la remise à chaque
 * versement partiel.
 */
export function buildPaymentPatch(
  current: { expected_amount?: number; received_amount?: number },
  amount: number
): Record<string, unknown> {
  const expected = current.expected_amount ?? 0
  const received = (current.received_amount ?? 0) + amount

  return {
    received_amount: received,
    total_amount: received,
    discount_amount: Math.max(0, expected - received),
  }
}

/**
 * Enregistre un versement reçu au comptoir sur une réservation.
 *
 * Sans rapport avec `booking_payments`, qui est le journal des paiements Wave :
 * ce flux-là porte un `provider`, une URL de paiement et un webhook, tout ce
 * qu'un règlement en espèces au comptoir n'a pas. Le versement est donc porté
 * par la réservation elle-même, là où le reste du domaine lit déjà l'encaissé.
 *
 * Un séjour annulé n'encaisse plus : accepter un versement dessus ferait
 * réapparaître dans les totaux un revenu que l'annulation en avait retiré.
 */
export class RecordBookingPaymentUseCase {
  async execute(id: string, ownerId: string, amount: number): Promise<BookingDto> {
    if (amount <= 0) {
      throw new DomainError('invalid_payment_amount', 'Le montant doit être supérieur à zéro.', 422)
    }

    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    if (booking.status === 'cancelled') {
      throw new DomainError(
        'booking_cancelled',
        'Réservation annulée : aucun encaissement possible.',
        409
      )
    }

    // La commission suit le montant encaissé : un complément de paiement la
    // relève d'autant.
    const patch = withReferrerCommission(booking, buildPaymentPatch(booking, amount))
    const updated = await Booking.findOneAndUpdate(id, patch, {
      owner_id: ownerId,
    })

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return BookingRepository.toDto(updated)
  }
}

export default RecordBookingPaymentUseCase
