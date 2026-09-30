import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Champs écrits par un encaissement au comptoir.
 *
 * Extraite pour être éprouvée sans Firestore : c'est un calcul d'argent, et
 * c'est le genre de composition où un champ omis ne se voit pas.
 *
 * Le versement s'ajoute à l'**acompte** (`deposit_amount`), l'argent déjà
 * reçu. Il ne touche pas au prix : `received_amount` porte le montant
 * **négocié** du séjour (voir `offlin-desgin.md`), et `total_amount` le suit.
 * Cumuler le versement dessus faisait monter le prix à chaque règlement — un
 * séjour à 60 000 F réglé en deux fois finissait à 120 000 F de chiffre
 * d'affaires.
 *
 * Un versement au-delà du reste dû est refusé : un trop-perçu se rend au
 * client, il ne s'enregistre pas comme un encaissement.
 *
 * @throws `payment_exceeds_balance` si le versement dépasse le reste dû
 */
export function buildPaymentPatch(
  current: { received_amount?: number; total_amount?: number; deposit_amount?: number },
  amount: number
): { deposit_amount: number } {
  // Repli sur `total_amount` : les réservations antérieures à la saisie
  // comptoir ne portent pas `received_amount`, et leur total en tient lieu.
  const price = current.received_amount ?? current.total_amount ?? 0
  const paid = current.deposit_amount ?? 0
  const balance = Math.max(0, price - paid)

  if (amount > balance) {
    throw new DomainError(
      'payment_exceeds_balance',
      `Le versement dépasse le reste dû (${balance} F).`,
      422
    )
  }

  return { deposit_amount: paid + amount }
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

    // La commission de l'apporteur porte sur le prix du séjour, qu'un
    // versement ne change pas : elle n'a pas à être recalculée ici.
    const patch = buildPaymentPatch(booking, amount)
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
