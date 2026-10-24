/**
 * Taux d'occupation : une seule formule pour tous les écrans.
 *
 * Le tableau de bord, le relevé Finance, le relevé gérant, le rapport
 * performance et le back-office calculaient chacun leur taux, avec deux défauts
 * communs :
 *
 * 1. **Jours arrondis à la borne.** Chaque séjour était compté en jours
 *    entamés *dans* la fenêtre : un séjour de 2 jours à cheval sur deux mois
 *    pesait 1 jour en septembre et 2 en octobre — 3 jours vendus pour 2. La
 *    capacité, elle aussi arrondie au jour supérieur, faussait le reste.
 * 2. **Parc mal compté.** Seuls les biens `published` et `rented` entraient au
 *    dénominateur. Un bien jamais mis en ligne — le cas de tout propriétaire
 *    qui ne vend qu'au comptoir — en sortait, et une réservation en ligne fait
 *    passer le sien en `reserved`, qui en sortait aussi : taux plafonné à
 *    100 % ou nul selon le parc.
 *
 * Désormais les jours **vendus** d'un séjour (`days_count`, ceux qui ont été
 * facturés) sont répartis au prorata du temps passé dans la fenêtre, et la
 * capacité est la durée exacte de la fenêtre multipliée par le parc exploité.
 * La somme des parts d'un séjour égale donc toujours ses jours vendus, quel
 * que soit le découpage.
 */

import { STAY_TYPES, stayTypeOccupancyDays, type StayType } from '#features/bookings/stay_type'

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

/** Réservation réduite à ce dont l'occupation a besoin. */
export interface OccupancyBooking {
  start_date: Date
  end_date?: Date | null
  days_count?: number | null
  /** Ancien nom de `days_count`, porté par l'historique. */
  nights_count?: number | null
  stay_type?: StayType | string | null
}

/** Durée exacte d'une fenêtre, en jours, sans arrondi. */
export function windowDays(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MILLISECONDS_PER_DAY)
}

/**
 * Jours vendus d'un séjour, au minimum un.
 *
 * `nights_count` : nom porté par les réservations enregistrées avant le passage
 * à une facturation en jours d'occupation. Le dernier repli recompte la
 * période, pour un document qui ne porterait ni l'un ni l'autre.
 */
function soldDays(booking: OccupancyBooking, start: Date, end: Date): number {
  const recorded = booking.days_count ?? booking.nights_count
  if (typeof recorded === 'number' && recorded > 0) return recorded

  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / MILLISECONDS_PER_DAY))
}

/**
 * Part d'un séjour tombant dans la fenêtre, de 0 à 1, au prorata du temps.
 *
 * Un séjour sans durée — sortie le jour même, ou dates corrompues — tombe
 * entièrement dans la fenêtre qui contient son entrée.
 */
export function bookingShareInWindow(booking: OccupancyBooking, from?: Date, to?: Date): number {
  const start = booking.start_date
  if (!start) return 0
  const end = booking.end_date ?? start

  if (end.getTime() <= start.getTime()) {
    const before = from !== undefined && start < from
    const after = to !== undefined && start >= to
    return before || after ? 0 : 1
  }

  const effectiveStart = from && from > start ? from : start
  const effectiveEnd = to && to < end ? to : end
  if (effectiveEnd <= effectiveStart) return 0

  return (effectiveEnd.getTime() - effectiveStart.getTime()) / (end.getTime() - start.getTime())
}

/**
 * Jours vendus d'un séjour imputables à la fenêtre, pondérés par type de séjour.
 *
 * Part proportionnelle au temps : un séjour de 2 jours dont 10 heures tombent
 * en septembre et 38 en octobre impute 0,42 jour à septembre et 1,58 à
 * octobre.
 */
export function occupiedDaysInWindow(booking: OccupancyBooking, from?: Date, to?: Date): number {
  const start = booking.start_date
  if (!start) return 0

  const share = bookingShareInWindow(booking, from, to)
  if (share === 0) return 0

  const sold = soldDays(booking, start, booking.end_date ?? start)

  // Les réservations antérieures au séjour comptoir n'ont pas de type : elles
  // sont toutes des séjours complets. Un type inconnu suit la même règle
  // plutôt que de rendre `NaN` jusqu'au taux affiché.
  const stayType = STAY_TYPES.includes(booking.stay_type as StayType)
    ? (booking.stay_type as StayType)
    : 'full_day'

  return stayTypeOccupancyDays(stayType, sold * share)
}

/** Total des jours vendus d'un lot de réservations sur la fenêtre. */
export function sumOccupiedDays(
  bookings: readonly OccupancyBooking[],
  from?: Date,
  to?: Date
): number {
  return bookings.reduce((sum, booking) => sum + occupiedDaysInWindow(booking, from, to), 0)
}

/**
 * Nombre de réservations tombant dans la fenêtre, chacune comptée pour la part
 * de sa durée qui s'y trouve.
 *
 * Dénominateur du séjour moyen. Le nombre brut de réservations ne convient
 * pas : un séjour de 3 jours du 31 octobre au 3 novembre n'apporte qu'un jour
 * à octobre mais y comptait pour une réservation entière — 1 j de séjour moyen
 * en octobre, 2 j en novembre, pour un séjour de 3 jours. Rapportés à la même
 * part, numérateur et dénominateur rendent 3 j dans les deux mois.
 */
export function sumBookingShares(
  bookings: readonly OccupancyBooking[],
  from?: Date,
  to?: Date
): number {
  return bookings.reduce((sum, booking) => sum + bookingShareInWindow(booking, from, to), 0)
}

/**
 * Logements ayant porté au moins un séjour sur la fenêtre.
 *
 * Déduit des réservations et non du statut `rented` du logement : depuis que
 * la disponibilité se lit sur les dates (`bookings/availability.ts`), plus
 * aucun flux n'écrit ce statut, et le compteur qui s'y fiait restait à zéro
 * quelle que soit l'activité.
 *
 * `unitIds` restreint le décompte aux logements de la capacité : une
 * réservation se rattache à sa résidence par un `residence_id` figé, et une
 * unité déplacée depuis ne doit pas compter dans une résidence qu'elle a
 * quittée.
 */
export function rentedUnits(
  bookings: readonly (OccupancyBooking & { property_id?: string | null })[],
  from?: Date,
  to?: Date,
  unitIds?: ReadonlySet<string> | null
): number {
  const rented = new Set<string>()

  for (const booking of bookings) {
    const propertyId = booking.property_id
    if (!propertyId || rented.has(propertyId)) continue
    if (unitIds && !unitIds.has(propertyId)) continue
    if (bookingShareInWindow(booking, from, to) > 0) rented.add(propertyId)
  }

  return rented.size
}

/**
 * Part des jours-bien vendus sur la fenêtre.
 *
 * Nulle sans parc ou sur une fenêtre vide — une fenêtre entièrement future se
 * réduit à un instant (`elapsedWindow`). Plafonnée à 1 : deux réservations
 * qui se chevauchent sur le même logement, saisies avant le contrôle de
 * chevauchement, pousseraient sinon le taux au-delà de 100 %.
 */
export function occupancyRate(
  bookings: readonly OccupancyBooking[],
  units: number,
  from: Date,
  to: Date
): number {
  const capacity = windowDays(from, to) * units
  if (!(capacity > 0)) return 0

  return Math.min(1, sumOccupiedDays(bookings, from, to) / capacity)
}

/**
 * Logements comptés dans la capacité : tous, sauf ceux mis hors service.
 *
 * Un logement en brouillon n'est pas en ligne mais se loue au comptoir ; un
 * logement réservé en ligne passe en `reserved` sans quitter le parc. Seul
 * `inactive` dit qu'il n'est plus exploité.
 */
export function exploitedUnits(stats: { total: number; inactive?: number }): number {
  return Math.max(0, stats.total - (stats.inactive ?? 0))
}
