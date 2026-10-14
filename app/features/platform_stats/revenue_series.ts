import { monthWindow, revenueForMonth, type StatsBooking } from '#features/bookings/booking_stats'

import type { RevenuePointDto } from './dto/platform_stats.dto.ts'

/** Libellé `AAAA-MM` d'un début de mois UTC. */
export function monthKey(from: Date): string {
  const month = String(from.getUTCMonth() + 1).padStart(2, '0')
  return `${from.getUTCFullYear()}-${month}`
}

/**
 * Revenu mois par mois sur les `months` derniers mois, mois en cours compris.
 *
 * Chaque mois reprend `revenueForMonth`, la fonction du tableau de bord
 * propriétaire : le back-office et l'application ne doivent jamais afficher
 * deux chiffres d'affaires différents pour le même mois.
 *
 * Les réservations reçues sont supposées non annulées ; celles qui ne touchent
 * aucun mois de la fenêtre ne pèsent sur rien.
 */
export function buildRevenueSeries(
  bookings: readonly StatsBooking[],
  now: Date,
  months: number
): RevenuePointDto[] {
  const count = Math.max(1, Math.floor(months))
  const points: RevenuePointDto[] = []

  for (let offset = -(count - 1); offset <= 0; offset++) {
    const window = monthWindow(now, offset)

    points.push({
      month: monthKey(window.from),
      revenue: revenueForMonth(bookings as StatsBooking[], window),
      bookings_started: bookings.filter(
        (b) => b.start_date >= window.from && b.start_date < window.to
      ).length,
    })
  }

  return points
}
