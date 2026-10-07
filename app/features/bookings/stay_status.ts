import type { BookingStatus } from '#models/booking'

/**
 * Bascule automatique du statut d'un séjour selon l'heure.
 *
 * Le statut ne bougeait qu'à la main : une réservation future restait
 * `confirmed` le jour de l'arrivée, et un séjour dont le propriétaire oubliait
 * la clôture restait « En cours » des jours après le départ du client. La
 * tâche planifiée `cron/stay-statuses` applique cette règle à intervalle
 * régulier ; la clôture manuelle reste possible — et préférable, puisqu'elle
 * consigne l'heure réelle de sortie.
 */

/**
 * Délai entre la sortie prévue et la clôture automatique.
 *
 * Un séjour clôturé ne se prolonge plus (`booking_already_completed`) : le
 * clore à l'heure pile priverait le propriétaire de la prolongation d'un client
 * qui s'attarde, ou qu'il n'a pas encore saisie. Six heures couvrent une sortie
 * tardive sans laisser un séjour fini « En cours » jusqu'au lendemain.
 */
export const AUTO_CLOSE_GRACE_MS = 6 * 60 * 60 * 1000

/** Réservation réduite à ce dont la bascule a besoin. */
export interface StayStatusBooking {
  status: BookingStatus
  start_date: Date
  end_date: Date
  check_in_at?: Date
  check_out_at?: Date
}

export type StayTransition =
  | { status: 'in_progress' }
  | {
      status: 'completed'
      completed_at: Date
      actual_check_out_at: Date
      closed_automatically: true
    }

/**
 * Transition due à l'instant `now`, ou `null` si le statut est à jour.
 *
 * Les dates sont lues sur `check_in_at` / `check_out_at`, à l'heure près, avec
 * repli sur `start_date` / `end_date` : les réservations en ligne et
 * l'historique ne portent pas les premières.
 *
 * La clôture automatique ne touche ni `end_date` ni `total_amount` — même
 * règle que `buildCheckOutPatch` : la période facturée pilote la répartition
 * du revenu. La sortie consignée est la sortie **prévue**, faute d'en connaître
 * une autre ; `closed_automatically` le signale.
 */
export function resolveStayTransition(
  booking: StayStatusBooking,
  now: Date
): StayTransition | null {
  if (booking.status !== 'confirmed' && booking.status !== 'in_progress') return null

  const checkIn = booking.check_in_at ?? booking.start_date
  const checkOut = booking.check_out_at ?? booking.end_date
  if (!checkIn || !checkOut) return null

  if (now.getTime() >= checkOut.getTime() + AUTO_CLOSE_GRACE_MS) {
    return {
      status: 'completed',
      completed_at: now,
      actual_check_out_at: checkOut,
      closed_automatically: true,
    }
  }

  if (booking.status === 'confirmed' && now.getTime() >= checkIn.getTime()) {
    return { status: 'in_progress' }
  }

  return null
}
