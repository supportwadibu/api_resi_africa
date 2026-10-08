import type { BookingStatus } from '#models/booking'

/**
 * Clôture automatique d'un séjour selon l'heure.
 *
 * Un séjour dont le propriétaire oubliait la clôture restait « En cours » des
 * jours après le départ du client. La tâche planifiée `cron/stay-statuses`
 * applique cette règle à intervalle régulier ; la clôture manuelle reste
 * possible — et préférable, puisqu'elle consigne l'heure réelle de sortie.
 *
 * L'arrivée, elle, ne bascule plus seule : une réservation passait « En
 * cours » à l'heure prévue, client présent ou non, et le registre de police
 * déclarait hébergé quelqu'un qui ne s'était pas présenté. Elle s'enregistre
 * au comptoir (`CheckInBookingUseCase`).
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

// Alias et non interface : le patch part dans `applyStatusTransition`, qui
// attend un `Record<string, unknown>` qu'une interface ne satisfait pas.
export type StayTransition = {
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
 *
 * Une réservation restée `confirmed` — arrivée jamais enregistrée — est close
 * de la même façon, comme avant : la traiter en absence relève d'une
 * annulation, que seul le propriétaire peut décider.
 */
export function resolveStayTransition(
  booking: StayStatusBooking,
  now: Date
): StayTransition | null {
  if (booking.status !== 'confirmed' && booking.status !== 'in_progress') return null

  const checkOut = booking.check_out_at ?? booking.end_date
  if (!checkOut) return null

  if (now.getTime() >= checkOut.getTime() + AUTO_CLOSE_GRACE_MS) {
    return {
      status: 'completed',
      completed_at: now,
      actual_check_out_at: checkOut,
      closed_automatically: true,
    }
  }

  return null
}
