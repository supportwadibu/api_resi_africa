import Booking from '#models/booking'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { BookingStatus } from '#models/booking'

import { findOverlappingPeriod, toPeriods } from '../availability.ts'
import type { BookingDto, UpdateOwnerBookingInput } from '../dto/booking.dto.ts'
import BookingRepository from '../repositories/booking_repository.ts'
import { withReferrerCommission } from '../referrer.ts'
import { defaultCheckOutFor, type StayType } from '../stay_type.ts'
import { computeOwnerBookingAmounts, resolveAgreedAmount } from './create_owner_booking.use_case.ts'

/**
 * Une réservation peut-elle encore être ressaisie ?
 *
 * Tant que le séjour n'est pas terminé : à venir ou en cours. Un séjour clos a
 * déjà produit son revenu et, le cas échéant, son départ anticipé ; le
 * réécrire déplacerait un chiffre d'affaires constaté.
 *
 * Comptoir seulement : une réservation en ligne a été payée au prix calculé par
 * la plateforme, et la réécrire au comptoir romprait ce que le client a réglé.
 * Une réservation sans `source` est de l'historique en ligne.
 */
export function assertBookingEditable(booking: {
  status: BookingStatus
  source?: 'online' | 'offline'
}): void {
  if (booking.status === 'completed') {
    throw new DomainError('booking_already_completed', 'Séjour déjà clôturé.', 409)
  }

  if (booking.status === 'cancelled') {
    throw new DomainError('booking_cancelled', 'Réservation annulée.', 409)
  }

  if ((booking.source ?? 'online') !== 'offline') {
    throw new DomainError(
      'booking_not_editable',
      'Une réservation prise en ligne ne se modifie pas depuis le comptoir.',
      422
    )
  }
}

/**
 * Champs réécrits par la modification d'une réservation comptoir.
 *
 * Extraite pour être éprouvée sans Firestore : c'est un calcul d'argent qui
 * énumère ses champs un à un, et un champ omis ne s'y voit pas.
 *
 * Le patch ne porte ni le client, ni le canal, ni le statut : le client est
 * figé dans `client_snapshot`, et le statut n'avance que par l'entrée, la
 * clôture ou l'annulation.
 */
export function buildEditPatch(input: {
  property: { id: string; residence_id: string | null; daily_price: number }
  stay_type: StayType
  check_in_at: Date
  check_out_at: Date
  amounts: { days: number; expected: number; discountPercent: number }
  received_amount: number | undefined
  /** Prix négocié par unité ; prime sur `received_amount`. */
  agreed_unit_price?: number | null
  deposit_amount: number
  message: string | null
}): Record<string, unknown> {
  const { expected, days, discountPercent } = input.amounts
  const { received, agreedUnitPrice } = resolveAgreedAmount(input, { days, expected })

  return {
    property_id: input.property.id,
    // Réécrite avec le logement : une réservation ressaisie sur une autre
    // unité est une correction de saisie, et son revenu relève de la
    // résidence de cette unité-là.
    residence_id: input.property.residence_id,
    stay_type: input.stay_type,
    // Les deux couples de dates restent identiques, comme à la création :
    // `start_date` / `end_date` sont la source de Finance.
    start_date: input.check_in_at,
    end_date: input.check_out_at,
    check_in_at: input.check_in_at,
    check_out_at: input.check_out_at,
    days_count: days,
    daily_price: input.property.daily_price,
    duration_discount_percent: discountPercent,
    subtotal_amount: expected,
    expected_amount: expected,
    received_amount: received,
    // Réécrit à chaque ressaisie, `null` compris : le formulaire renvoie tout,
    // et un séjour remis au tarif ne doit pas garder l'ancien prix négocié
    // pour sa prochaine prolongation.
    agreed_unit_price: agreedUnitPrice,
    total_amount: received,
    // Même règle qu'à la création : l'écart entre attendu et convenu est une
    // remise consentie, jamais négative.
    discount_amount: Math.max(0, expected - received),
    deposit_amount: input.deposit_amount,
    message: input.message,
  }
}

/**
 * Ressaisit une réservation comptoir non terminée : logement, type de séjour,
 * dates, prix convenu, acompte, message.
 *
 * Distinct de la prolongation, qui ne déplace que la sortie et garde le
 * logement : ici tout peut bouger, y compris l'entrée d'un séjour saisi par
 * erreur. Le montant attendu est recalculé sur la grille **courante** du
 * logement choisi — la réservation est corrigée, pas rallongée.
 */
export class UpdateOwnerBookingUseCase {
  async execute(id: string, ownerId: string, input: UpdateOwnerBookingInput): Promise<BookingDto> {
    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    assertBookingEditable(booking)

    const property = await Property.findById(input.property_id)
    if (!property || property.owner_id !== ownerId) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const checkIn = input.check_in_at
    const checkOut = input.check_out_at ?? defaultCheckOutFor(input.stay_type, checkIn)

    const amounts = computeOwnerBookingAmounts(property.pricing, input.stay_type, checkIn, checkOut)

    const patch = withReferrerCommission(
      booking,
      buildEditPatch({
        property: {
          id: property._id,
          residence_id: property.residence_id ?? null,
          daily_price: property.pricing.daily_price,
        },
        stay_type: input.stay_type,
        check_in_at: checkIn,
        check_out_at: checkOut,
        amounts,
        received_amount: input.received_amount,
        agreed_unit_price: input.agreed_unit_price,
        // Absent : l'acompte déjà enregistré tient toujours. Le ramener à zéro
        // parce qu'un écran ne l'a pas renvoyé effacerait un versement réel.
        deposit_amount: input.deposit_amount ?? booking.deposit_amount ?? 0,
        message: input.message === undefined ? booking.message : input.message,
      })
    )

    let updated
    try {
      updated = await Booking.rewriteOwnerBooking(
        id,
        patch,
        { owner_id: ownerId },
        { property_id: property._id, check_in_at: checkIn },
        // La réservation modifiée est écartée par son identifiant : elle
        // chevaucherait sinon sa propre ancienne période.
        (active) =>
          findOverlappingPeriod(
            { check_in_at: checkIn, check_out_at: checkOut },
            toPeriods(active).filter((period) => period._id !== id)
          ) !== null
      )
    } catch (error) {
      if (error instanceof Error && error.message === 'booking_period_conflict') {
        throw new DomainError(
          'booking_period_conflict',
          'Ce bien est déjà réservé sur cette période.',
          409
        )
      }
      if (error instanceof Error && error.message === 'booking_not_editable') {
        // Statut changé entre la lecture et la transaction — clôturé ou annulé
        // depuis un autre appareil : la garde est rejouée sur l'état relu.
        throw new DomainError(
          'booking_not_editable',
          'Cette réservation vient de changer de statut. Rechargez-la.',
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

export default UpdateOwnerBookingUseCase
