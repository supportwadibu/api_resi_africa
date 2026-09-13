import type { ClientStatsDto } from '../dto/client.dto.ts'

/**
 * Réservation réduite aux champs qui pèsent sur les statistiques du carnet.
 *
 * Volontairement plus étroit que `BookingRecord` : le calcul est une fonction
 * pure, testée sans Firebase, et n'a pas à suivre les évolutions du document.
 */
export interface StatsCountableBooking {
  status: string
  total_amount?: number
  received_amount?: number
  check_in_at?: Date | null
  start_date?: Date | null
}

/**
 * Statuts qui comptent dans les statistiques d'un client.
 *
 * Une réservation annulée n'a produit ni séjour ni encaissement : la compter
 * gonflerait la fidélité d'un client qui s'est désisté. Tout le reste compte,
 * y compris un séjour en cours ou confirmé non encore clôturé — sinon un
 * propriétaire qui ne clôture jamais ses séjours à la main verrait son carnet
 * entier figé à zéro.
 */
const COUNTED_STATUSES = new Set(['confirmed', 'in_progress', 'completed'])

/**
 * Montant retenu pour un séjour : ce que le client a réellement versé.
 *
 * `received_amount` n'existe que sur les réservations comptoir, où le montant
 * encaissé peut être négocié en dessous du tarif. Le repli sur `total_amount`
 * couvre les réservations en ligne et l'historique antérieur au champ, payées
 * intégralement à la réservation.
 */
export function countedAmount(booking: StatsCountableBooking): number {
  return booking.received_amount ?? booking.total_amount ?? 0
}

/**
 * Agrège les statistiques d'un client depuis ses réservations.
 *
 * Le cumul est recalculé plutôt qu'incrémenté : un compteur incrémental dérive
 * dès qu'un séjour est annulé après coup ou qu'un montant est corrigé, et rien
 * ne permet de le réaligner. Recalculer rend les chiffres auto-réparants, y
 * compris sur les fiches écrites avant l'existence de ce calcul.
 */
export function computeClientStats(bookings: StatsCountableBooking[]): ClientStatsDto {
  let totalStays = 0
  let totalPaid = 0
  let lastStayAt: Date | null = null

  for (const booking of bookings) {
    if (!COUNTED_STATUSES.has(booking.status)) continue

    totalStays += 1
    totalPaid += countedAmount(booking)

    // L'arrivée réelle prime sur la période facturée : au comptoir, un client
    // peut se présenter un jour après la date portée par la réservation.
    const stayDate = booking.check_in_at ?? booking.start_date ?? null
    if (stayDate && (!lastStayAt || stayDate.getTime() > lastStayAt.getTime())) {
      lastStayAt = stayDate
    }
  }

  return { total_stays: totalStays, total_paid: totalPaid, last_stay_at: lastStayAt }
}
