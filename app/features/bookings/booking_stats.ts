/**
 * Chiffres du tableau de bord des réservations.
 *
 * Le revenu et le taux d'occupation sont dérivés des mêmes primitives que le
 * relevé financier — répartition au prorata des jours, pondération par type de
 * séjour. Les recalculer autrement ferait afficher deux chiffres d'affaires
 * contradictoires pour le même mois, l'un sur le tableau de bord, l'autre sur
 * le rapport.
 */

import { daysWithinWindow, splitRevenueByMonth } from '#features/finance/revenue_split'

import { stayTypeOccupancyDays, type StayType } from './stay_type.ts'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

/** Fenêtre bornée à gauche, ouverte à droite : `from` inclus, `to` exclu. */
export interface MonthWindow {
  from: Date
  to: Date
}

/** Réservation réduite à ce dont ces agrégats ont besoin. */
export interface StatsBooking {
  status: string
  start_date: Date
  end_date: Date
  total_amount: number
  stay_type?: StayType | string
}

/**
 * Bornes d'un mois calendaire, en UTC.
 *
 * `offset` recule ou avance de N mois : `-1` donne le mois précédent, en
 * franchissant correctement la frontière d'année — `Date.UTC` normalise un
 * mois `-1` en décembre de l'année d'avant.
 */
export function monthWindow(reference: Date, offset = 0): MonthWindow {
  const year = reference.getUTCFullYear()
  const month = reference.getUTCMonth() + offset

  return {
    from: new Date(Date.UTC(year, month, 1)),
    to: new Date(Date.UTC(year, month + 1, 1)),
  }
}

/**
 * Séjours confirmés dont l'arrivée reste à venir.
 *
 * Distinct de « en cours » : la période est bloquée, le client n'est pas
 * encore là. Un séjour confirmé mais déjà commencé n'est plus à venir même si
 * son statut n'a pas encore basculé — la bascule dépend d'une action du
 * propriétaire au comptoir, qui peut tarder.
 */
export function countUpcoming(bookings: StatsBooking[], now: Date): number {
  return bookings.filter((b) => b.status === 'confirmed' && b.start_date > now).length
}

/** Séjours en cours : le client est arrivé et n'a pas encore quitté. */
export function countInProgress(bookings: StatsBooking[]): number {
  return bookings.filter((b) => b.status === 'in_progress').length
}

/**
 * Revenu constaté sur un mois.
 *
 * Seules les tranches tombant dans la fenêtre sont retenues : un séjour du
 * 28 février au 6 mars imputerait sinon ses 60 000 F à février *et* à mars.
 */
export function revenueForMonth(bookings: StatsBooking[], window: MonthWindow): number {
  let total = 0

  for (const booking of bookings) {
    if (!booking.start_date) continue

    const end = booking.end_date ?? booking.start_date

    for (const slice of splitRevenueByMonth(booking.start_date, end, booking.total_amount ?? 0)) {
      const sliceStart = new Date(Date.UTC(slice.year, slice.month, 1))
      if (sliceStart.getTime() !== window.from.getTime()) continue

      total += slice.amount
    }
  }

  return total
}

/**
 * Variation d'un mois à l'autre, en pourcentage arrondi au dixième.
 *
 * `null` quand le mois précédent est à zéro : une progression depuis rien n'a
 * pas de valeur définissable, et afficher « +100 % » laisserait croire à un
 * doublement.
 */
export function growthPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null

  return Math.round(((current - previous) / previous) * 1000) / 10
}

/**
 * Part des jours-bien occupés sur la fenêtre.
 *
 * Même formule que le relevé financier : les jours retenus sont ceux tombant
 * dans la fenêtre, pondérés par le type de séjour — une demi-journée
 * n'immobilise pas le bien autant qu'un séjour complet. Le dénominateur est la
 * capacité du parc exploité, plafonné à 1 pour les séjours débordant la
 * fenêtre.
 */
export function occupancyForWindow(
  bookings: StatsBooking[],
  exploitedProperties: number,
  window: MonthWindow
): number {
  if (!exploitedProperties) return 0

  const occupiedDays = bookings.reduce(
    (sum, b) =>
      sum +
      stayTypeOccupancyDays(
        // Les réservations antérieures au séjour comptoir n'ont pas de type :
        // elles sont toutes des séjours complets.
        (b.stay_type as StayType) ?? 'full_day',
        daysWithinWindow(b.start_date, b.end_date, window.from, window.to)
      ),
    0
  )

  const windowDays = Math.max(
    1,
    Math.ceil((window.to.getTime() - window.from.getTime()) / MILLISECONDS_PER_DAY)
  )
  const capacity = windowDays * exploitedProperties
  if (capacity <= 0) return 0

  return Math.min(1, occupiedDays / capacity)
}
