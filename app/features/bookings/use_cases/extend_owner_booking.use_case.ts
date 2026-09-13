import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import { findExtensionConflict, toPeriods } from '../availability.ts'
import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import { computeOwnerBookingAmounts } from './create_owner_booking.use_case.ts'

/**
 * Champs écrits par la prolongation d'un séjour comptoir.
 *
 * `received_amount` est réajusté et non conservé : le laisser à sa valeur
 * d'origine ferait voir à Finance un impayé sur une prolongation pourtant
 * réglée — un séjour de 2 jours à 20 000 F encaissés, prolongé à 5 jours,
 * resterait à 20 000 F encaissés pour 50 000 F attendus.
 *
 * `start_date` et `check_in_at` sont délibérément absents : une prolongation
 * ne déplace que la sortie. Les toucher réécrirait la répartition mensuelle du
 * revenu que Finance calcule depuis la date d'entrée.
 */
export function buildExtensionPatch(
  checkOut: Date,
  days: number,
  expected: number,
  received: number
): Record<string, unknown> {
  return {
    end_date: checkOut,
    check_out_at: checkOut,
    days_count: days,
    subtotal_amount: expected,
    expected_amount: expected,
    received_amount: received,
    total_amount: received,
    // L'écart entre attendu et encaissé est une remise consentie, même règle
    // qu'à la création comptoir.
    discount_amount: Math.max(0, expected - received),
  }
}

/**
 * Prolonge un séjour pris au comptoir.
 *
 * Distinct de `UpdateBookingUseCase`, qui sert le flux en ligne : celui-ci ne
 * connaît ni code promo ni remise de durée, mais doit réajuster le montant
 * encaissé — un séjour rallongé sans réajustement laisserait Finance voir un
 * impayé qui n'existe pas.
 *
 * La prolongation n'est possible que sur un séjour complet : une demi-journée
 * ou un passage se facture à l'unité, et les rallonger n'a pas de sens — le
 * propriétaire saisit un nouveau séjour.
 */
export class ExtendOwnerBookingUseCase {
  async execute(
    id: string,
    ownerId: string,
    input: { check_out_at: Date; received_amount?: number }
  ): Promise<BookingDto> {
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

    const stayType = booking.stay_type ?? 'full_day'
    if (stayType !== 'full_day') {
      throw new DomainError(
        'extension_not_supported',
        'Seul un séjour complet peut être prolongé. Enregistrez un nouveau séjour.',
        422
      )
    }

    // Repli sur `start_date` / `end_date` : les réservations antérieures à la
    // saisie comptoir ne portent pas `check_in_at` / `check_out_at`.
    const checkIn = booking.check_in_at ?? booking.start_date
    const currentCheckOut = booking.check_out_at ?? booking.end_date

    if (input.check_out_at.getTime() <= currentCheckOut.getTime()) {
      throw new DomainError(
        'invalid_extension',
        'La nouvelle date de sortie doit être postérieure à la date actuelle.',
        422
      )
    }

    const property = await Property.findById(booking.property_id)
    if (!property) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const { days, expected } = computeOwnerBookingAmounts(
      property.pricing,
      stayType,
      checkIn,
      input.check_out_at
    )

    // À défaut de montant renégocié, le propriétaire encaisse le nouveau
    // montant attendu : laisser `received_amount` à sa valeur d'origine
    // afficherait un impayé sur une prolongation pourtant réglée.
    const received = input.received_amount ?? expected

    let updated
    try {
      updated = await Booking.extendBooking(
        id,
        buildExtensionPatch(input.check_out_at, days, expected, received),
        { owner_id: ownerId },
        (active) =>
          findExtensionConflict(id, currentCheckOut, input.check_out_at, toPeriods(active)) !== null
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'booking_period_conflict') {
        throw new DomainError(
          'booking_period_conflict',
          'Ce bien est déjà réservé sur la période demandée.',
          409
        )
      }
      throw error
    }

    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return BookingRepository.toDto(updated)
  }
}

export default ExtendOwnerBookingUseCase
