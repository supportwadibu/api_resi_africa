import Booking from '#models/booking'
import type { BookingRecord } from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto, BookingStatus, CheckOutBookingInput } from '../dto/booking.dto.ts'
import { buildEarlyCheckOutPatch, quoteEarlyCheckOut } from '../early_check_out.ts'
import { withReferrerCommission } from '../referrer.ts'
import BookingRepository from '../repositories/booking_repository.ts'

/**
 * Champs écrits par la clôture.
 *
 * `end_date` et `check_out_at` sont délibérément absents : ils portent la
 * période sur laquelle `total_amount` a été calculé, et Finance les lit pour
 * répartir le revenu entre les mois. Les écraser à l'instant de la clôture
 * réécrirait rétroactivement un chiffre d'affaires déjà constaté sans que le
 * montant bouge — un séjour du 28 octobre au 3 novembre clôturé le 10 novembre
 * verrait la part d'octobre tomber de 40 000 à ~18 500 F, et un mois clos se
 * mettrait à bouger tout seul.
 *
 * La sortie réelle est donc consignée à part, dans `actual_check_out_at` :
 * l'information n'est pas perdue, mais elle ne pilote aucun calcul. Un départ
 * anticipé ne passe pas par ici mais par `buildEarlyCheckOutPatch`, qui réécrit
 * la période **et** le montant d'un même geste.
 */
export function buildCheckOutPatch(now: Date): {
  status: BookingStatus
  completed_at: Date
  actual_check_out_at: Date
} {
  return { status: 'completed', completed_at: now, actual_check_out_at: now }
}

/**
 * Le client est-il entré ?
 *
 * `check_in_at` est lu en priorité : un passage saisi pour 14 h a une
 * `start_date` déjà dépassée dès minuit, alors que le client n'est pas là.
 * Repli sur `start_date` : les réservations antérieures à la saisie comptoir
 * ne portent pas `check_in_at`.
 */
export function isStayStarted(
  booking: { start_date: Date; check_in_at?: Date },
  now: Date
): boolean {
  const checkIn = booking.check_in_at ?? booking.start_date
  return checkIn.getTime() <= now.getTime()
}

/**
 * Lit une réservation et vérifie qu'elle peut être clôturée.
 *
 * Partagé par la clôture et sa simulation : un aperçu accepté sur un séjour
 * que la clôture refuserait ferait valider au propriétaire un montant sans
 * suite.
 *
 * Un séjour pas encore commencé ne se clôture pas, il s'annule : le clôturer
 * compterait comme encaissé un séjour qui n'a jamais eu lieu.
 */
export async function findClosableBooking(
  id: string,
  ownerId: string,
  now: Date
): Promise<BookingRecord> {
  const booking = await Booking.findById(id)
  if (!booking || booking.owner_id !== ownerId) {
    throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
  }

  if (booking.status === 'completed') {
    throw new DomainError('booking_already_completed', 'Séjour déjà clôturé.', 409)
  }

  if (booking.status === 'cancelled') {
    throw new DomainError('booking_cancelled', 'Réservation annulée.', 409)
  }

  if (!isStayStarted(booking, now)) {
    throw new DomainError(
      'stay_not_started',
      'Le séjour n’a pas encore commencé. Annulez la réservation plutôt que de la clôturer.',
      422
    )
  }

  return booking
}

/**
 * Clôture un séjour, mené à terme ou écourté.
 *
 * Mené à terme — cas par défaut, et seul connu des versions du mobile déjà
 * installées —, seul le statut change. Écourté (`full_stay: false`), la
 * période et le montant sont ramenés à l'usage réel et l'écart est consigné
 * comme remboursé.
 *
 * Les statistiques du carnet ne sont plus cumulées ici : elles se recalculent
 * depuis les réservations à la lecture de la fiche. Les incrémenter à la
 * clôture laissait à zéro le client d'un propriétaire qui ne clôture jamais,
 * et laissait dériver le compteur sur toute correction ultérieure.
 */
export class CheckOutBookingUseCase {
  async execute(
    id: string,
    ownerId: string,
    input: CheckOutBookingInput = {}
  ): Promise<BookingDto> {
    const now = new Date()
    const booking = await findClosableBooking(id, ownerId, now)

    let patch: Record<string, unknown> = buildCheckOutPatch(now)

    if (input.full_stay === false) {
      const quote = quoteEarlyCheckOut(booking, input.actual_check_out_at ?? now, now)
      // Un séjour écourté réduit le montant retenu, et la commission avec lui.
      patch = withReferrerCommission(
        booking,
        buildEarlyCheckOutPatch(booking, quote, input.final_amount ?? quote.proposed_amount, now)
      )
    }

    const updated = await Booking.findOneAndUpdate(id, patch, {
      owner_id: ownerId,
    })

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return BookingRepository.toDto(updated)
  }
}

export default CheckOutBookingUseCase
