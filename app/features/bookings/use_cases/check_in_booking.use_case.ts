import Booking from '#models/booking'
import type { BookingStatus } from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { BookingDto } from '../dto/booking.dto.ts'
import { CLOCK_SKEW_TOLERANCE_MS } from '../early_check_out.ts'
import BookingRepository from '../repositories/booking_repository.ts'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Début du jour J : minuit du jour d'entrée prévu.
 *
 * Calculé en UTC : la Côte d'Ivoire vit à UTC+0 toute l'année, sans heure
 * d'été, si bien que le jour UTC est le jour du comptoir.
 */
export function startOfArrivalDay(checkIn: Date): Date {
  return new Date(Math.floor(checkIn.getTime() / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY)
}

/** Réservation réduite à ce dont l'enregistrement de l'arrivée a besoin. */
export interface CheckInBooking {
  status: BookingStatus
  start_date: Date
  end_date: Date
  check_in_at?: Date
  check_out_at?: Date
}

/**
 * Champs écrits par l'enregistrement de l'arrivée.
 *
 * L'arrivée se constate à partir du jour J, jamais avant : enregistrer la
 * veille un client qui n'est pas encore là le ferait figurer comme hébergé
 * au registre de police. Avant l'heure prévue du jour J, elle est acceptée —
 * un client qui arrive à 10 h pour une entrée à 14 h est bien dans les murs.
 *
 * La période facturée ne bouge pas : `check_in_at` et `start_date` portent le
 * montant et la répartition du revenu, que Finance lit. L'heure réelle est
 * consignée à part, dans `actual_check_in_at`, comme la sortie l'est dans
 * `actual_check_out_at`.
 *
 * [declared] : heure saisie hors ligne. Sans elle, l'arrivée vaut l'heure
 * d'écriture, qui peut suivre l'arrivée réelle de plusieurs heures.
 */
export function buildCheckInPatch(
  booking: CheckInBooking,
  declared: Date | undefined,
  now: Date
): { status: 'in_progress'; actual_check_in_at: Date } {
  if (booking.status === 'in_progress') {
    throw new DomainError('booking_already_checked_in', 'L’arrivée est déjà enregistrée.', 409)
  }

  if (booking.status === 'completed') {
    throw new DomainError('booking_already_completed', 'Séjour déjà clôturé.', 409)
  }

  if (booking.status === 'cancelled') {
    throw new DomainError('booking_cancelled', 'Réservation annulée.', 409)
  }

  // Repli sur `start_date` / `end_date` : les réservations en ligne et
  // l'historique ne portent pas `check_in_at` / `check_out_at`.
  const checkIn = booking.check_in_at ?? booking.start_date
  const checkOut = booking.check_out_at ?? booking.end_date
  const arrival = declared ?? now
  const dayStart = startOfArrivalDay(checkIn)

  if (now.getTime() + CLOCK_SKEW_TOLERANCE_MS < dayStart.getTime()) {
    throw new DomainError(
      'check_in_too_early',
      'L’arrivée s’enregistre à partir du jour du séjour.',
      422
    )
  }

  if (arrival.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    throw new DomainError(
      'arrival_in_future',
      'L’heure d’arrivée ne peut pas être dans le futur.',
      422
    )
  }

  if (arrival.getTime() < dayStart.getTime()) {
    throw new DomainError(
      'arrival_before_stay',
      'L’heure d’arrivée doit tomber le jour du séjour ou après.',
      422
    )
  }

  // Un client qui se présente après la sortie prévue n'a plus de séjour à
  // ouvrir : la réservation se prolonge, s'annule ou se clôture.
  if (arrival.getTime() >= checkOut.getTime()) {
    throw new DomainError(
      'stay_period_over',
      'La sortie prévue est passée : prolongez, clôturez ou annulez la réservation.',
      422
    )
  }

  return { status: 'in_progress', actual_check_in_at: arrival }
}

/**
 * Enregistre l'arrivée d'un client sur une réservation à venir.
 *
 * Seul geste qui fait passer une réservation « En cours » : la bascule
 * automatique à l'heure prévue a été retirée, elle déclarait présent un client
 * qui ne s'était pas présenté.
 *
 * L'écriture est conditionnée au statut lu (`applyStatusTransition`) : deux
 * enregistrements concurrents, ou une annulation intercalée, ne s'écrasent pas.
 */
export class CheckInBookingUseCase {
  async execute(
    id: string,
    ownerId: string,
    input: { actual_check_in_at?: Date } = {}
  ): Promise<BookingDto> {
    const now = new Date()

    const booking = await Booking.findById(id)
    if (!booking || booking.owner_id !== ownerId) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    const patch = buildCheckInPatch(booking, input.actual_check_in_at, now)

    const applied = await Booking.applyStatusTransition(id, booking.status, patch)
    if (!applied) {
      throw new DomainError(
        'booking_status_changed',
        'La réservation vient d’être modifiée. Rouvrez-la et réessayez.',
        409
      )
    }

    const updated = await Booking.findById(id)
    if (!updated) {
      throw new DomainError('booking_not_found', 'Réservation introuvable.', 404)
    }

    return BookingRepository.toDto(updated)
  }
}

export default CheckInBookingUseCase
