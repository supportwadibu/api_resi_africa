import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import { findExtensionConflict, toPeriods } from '../availability.ts'
import type { BookingDto } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import { computeOwnerBookingAmounts } from './create_owner_booking.use_case.ts'
import { withReferrerCommission } from '../referrer.ts'

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
  received: number,
  discountPercent = 0
): Record<string, unknown> {
  return {
    end_date: checkOut,
    check_out_at: checkOut,
    days_count: days,
    // Le séjour rallongé peut franchir un palier : le taux suit la nouvelle
    // durée, comme le montant attendu calculé dessus.
    duration_discount_percent: discountPercent,
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
 * Prix convenu d'un séjour prolongé, à défaut de montant renégocié.
 *
 * Un prix négocié à la réservation reste le prix de la maison pour ce client :
 * les jours ajoutés se facturent au **tarif journalier convenu** (prix convenu
 * ÷ jours), pas au tarif de la grille. Repartir de la grille faisait payer la
 * prolongation plein tarif — et effaçait au passage la remise déjà consentie
 * sur les premiers jours.
 *
 * Le prix unitaire saisi au comptoir, figé sur la réservation, fait foi. Le
 * quotient prix ÷ jours n'est qu'un repli pour l'historique qui ne le porte
 * pas : un total calculé sur un autre décompte de jours que le nôtre le
 * faussait — 15 000 F convenus pour un jour, comptés ici sur deux, donnaient
 * 7 500 F le jour ajouté.
 *
 * Sans négociation, la grille s'applique au séjour entier : le palier de durée
 * que la prolongation peut franchir profite alors au client, comme en ligne.
 */
export function extendedAgreedAmount(
  current: { days: number; expected: number; received: number; agreedUnitPrice?: number | null },
  extended: { days: number; expected: number }
): number {
  const unit = current.agreedUnitPrice
  if (typeof unit === 'number' && Number.isFinite(unit)) {
    return Math.round(unit * extended.days)
  }

  const negotiated = current.received !== current.expected
  if (!negotiated || current.days <= 0) return extended.expected

  // Arrondi au franc : le FCFA n'a pas de subdivision en circulation.
  return Math.round((current.received / current.days) * extended.days)
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

    const { days, expected, discountPercent } = computeOwnerBookingAmounts(
      property.pricing,
      stayType,
      checkIn,
      input.check_out_at
    )

    // À défaut de montant renégocié, le prix suit le tarif convenu à la
    // réservation : laisser `received_amount` à sa valeur d'origine
    // afficherait un impayé sur une prolongation pourtant réglée, et repartir
    // de la grille effacerait la remise consentie.
    //
    // Replis sur l'historique : les réservations antérieures à la saisie
    // comptoir ne portent ni `expected_amount` ni `received_amount`, et leur
    // `total_amount` vaut les deux.
    const currentReceived = booking.received_amount ?? booking.total_amount
    const received =
      input.received_amount ??
      extendedAgreedAmount(
        {
          days: booking.days_count ?? booking.nights_count ?? 0,
          expected: booking.expected_amount ?? currentReceived,
          received: currentReceived,
          // Absent de l'historique : le repli sur le quotient s'applique.
          agreedUnitPrice: booking.agreed_unit_price ?? null,
        },
        { days, expected }
      )

    let updated
    try {
      updated = await Booking.extendBooking(
        id,
        withReferrerCommission(
          booking,
          buildExtensionPatch(input.check_out_at, days, expected, received, discountPercent)
        ),
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
