import Booking from '#models/booking'
import Client from '#models/client'
import Property from '#models/property'
import { DomainError } from '#utils/domain_error'

import type { PropertyPricing } from '#models/property'

import { findOverlappingPeriod, toPeriods } from '../availability.ts'
import { countStayDays } from '../stay_pricing.ts'
import { defaultCheckOutFor, resolveStayTypePrice, type StayType } from '../stay_type.ts'
import BookingRepository from '../repositories/booking_repository.ts'

import type { BookingDto, CreateOwnerBookingInput } from '../dto/booking.dto.ts'

/**
 * Montant attendu d'un séjour comptoir.
 *
 * Distinct de `calculateStayPrice`, qui sert le flux en ligne : celui-ci ne
 * connaît qu'un séjour complet remisé par durée, alors qu'une réservation
 * comptoir peut être infra-journalière et se conclut sur un prix négocié.
 *
 * `minimum_stay_days` n'est pas appliqué hors séjour complet : il vaut 1 par
 * défaut, et l'y soumettre rendrait la demi-journée impossible sur tout bien
 * existant.
 */
export function computeOwnerBookingAmounts(
  pricing: PropertyPricing,
  stayType: StayType,
  checkIn: Date,
  checkOut: Date
): { days: number; expected: number } {
  if (checkOut.getTime() <= checkIn.getTime()) {
    throw new DomainError(
      'invalid_stay_dates',
      'La date de sortie doit être postérieure à la date d’entrée.',
      422
    )
  }

  const unitPrice = resolveStayTypePrice(pricing, stayType)

  if (stayType !== 'full_day') {
    // Une demi-journée ou un passage se facture à l'unité ; `days_count` vaut
    // 1 pour rester lisible par Finance et les écrans existants.
    return { days: 1, expected: unitPrice }
  }

  const days = Math.max(1, countStayDays(checkIn, checkOut))

  const minimum = pricing.minimum_stay_days ?? 1
  if (days < minimum) {
    throw new DomainError('minimum_stay_not_reached', `Séjour minimum de ${minimum} jour(s).`, 422)
  }

  return { days, expected: Math.round(days * unitPrice) }
}

/**
 * Enregistre une réservation prise au comptoir.
 *
 * Distinct de `CreateBookingUseCase` : les deux ne partagent ni les règles ni
 * les entrées. Le flux client valide un code promo et refuse qu'un
 * propriétaire réserve son propre bien ; celui-ci gère l'acompte, le montant
 * négocié et l'idempotence.
 */
export class CreateOwnerBookingUseCase {
  async execute(input: CreateOwnerBookingInput): Promise<BookingDto> {
    // Court-circuit d'un retry déjà abouti : évite de relire le bien et le
    // client pour rien. L'idempotence elle-même ne repose pas sur ce contrôle
    // — il n'est pas atomique — mais sur l'écriture par identifiant dérivé de
    // `createOwnerBooking`.
    if (input.client_request_id) {
      const existing = await Booking.findByRequestId(input.owner_id, input.client_request_id)
      if (existing) return BookingRepository.toDto(existing)
    }

    const property = await Property.findById(input.property_id)
    if (!property || property.owner_id !== input.owner_id) {
      throw new DomainError('property_not_found', 'Bien introuvable.', 404)
    }

    const client = await Client.findById(input.client_id)
    if (!client || client.owner_id !== input.owner_id) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    const checkIn = input.check_in_at
    const checkOut = input.check_out_at ?? defaultCheckOutFor(input.stay_type, checkIn)

    const { days, expected } = computeOwnerBookingAmounts(
      property.pricing,
      input.stay_type,
      checkIn,
      checkOut
    )

    // Le chevauchement est vérifié *dans* la transaction d'écriture : hors
    // transaction, deux saisies concurrentes sur le même bien et la même nuit
    // le passaient toutes les deux, et deux clients se présentaient pour un
    // seul logement.
    let created
    try {
      created = await Booking.createOwnerBooking({
        owner_id: input.owner_id,
        property_id: input.property_id,
        // Figé à la création, comme le flux en ligne.
        residence_id: property.residence_id ?? null,
        client_id: input.client_id,
        client_snapshot: { full_name: client.full_name, phone: client.phone },
        status: input.is_check_in ? 'in_progress' : 'confirmed',
        stay_type: input.stay_type,
        check_in_at: checkIn,
        check_out_at: checkOut,
        days_count: days,
        daily_price: property.pricing.daily_price,
        expected_amount: expected,
        received_amount: input.received_amount ?? expected,
        deposit_amount: input.deposit_amount ?? 0,
        message: input.message ?? null,
        client_request_id: input.client_request_id ?? null,
        detectConflict: (active) =>
          findOverlappingPeriod(
            { check_in_at: checkIn, check_out_at: checkOut },
            toPeriods(active)
          ) !== null,
      })
    } catch (error) {
      // La transaction ne peut porter qu'une `Error` nue : le code métier lui
      // est rendu ici, la couche modèle n'ayant pas à connaître les statuts
      // HTTP.
      if (error instanceof Error && error.message === 'booking_period_conflict') {
        throw new DomainError(
          'booking_period_conflict',
          'Ce bien est déjà réservé sur cette période.',
          409
        )
      }
      throw error
    }

    return BookingRepository.toDto(created)
  }
}

export default CreateOwnerBookingUseCase
