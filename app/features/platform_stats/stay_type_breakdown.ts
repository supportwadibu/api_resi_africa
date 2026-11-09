import { monthWindow } from '#features/bookings/booking_stats'
import { stayTypeOccupancyDays, type StayType } from '#features/bookings/stay_type'
import { DomainError } from '#utils/domain_error'

/**
 * Répartition des réservations par type de séjour, pour l'équipe RESI.
 *
 * Le type enregistré (`passage`, `half_day`, `full_day`) ne dit rien de la
 * durée d'un séjour complet : un jour et un mois y tombent ensemble. Les
 * séjours complets sont donc redécoupés par nombre de jours, aux seuils où le
 * métier change — la nuitée, la semaine, le mois.
 */
export const STAY_BUCKETS = [
  'passage',
  'half_day',
  'one_day',
  'two_to_six_days',
  'seven_to_twenty_nine_days',
  'thirty_days_plus',
] as const
export type StayBucket = (typeof STAY_BUCKETS)[number]

/** Réservation réduite à ce que la répartition lit. */
export interface StayBreakdownBooking {
  // Absent sur l'historique : séjour complet.
  stay_type?: StayType | string
  days_count: number
  total_amount: number
}

export interface StayBucketDto {
  key: StayBucket
  bookings: number
  /** Part des réservations de la période, en pourcentage arrondi au dixième. */
  share_percent: number
  revenue: number
  /** Jours immobilisés, pondérés comme le taux d'occupation. */
  occupancy_days: number
}

export interface StayTypeBreakdownDto {
  /** Nombre de mois glissants ; `null` quand la période a été choisie par dates. */
  months: number | null
  from: Date
  /** Dernier jour compté, inclus ; `null` pour les mois glissants (jusqu'à maintenant). */
  to: Date | null
  owner_id: string | null
  total_bookings: number
  buckets: StayBucketDto[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Deux ans au plus, comme les mois glissants : chaque jour ajouté élargit la
 * lecture des réservations, faite en mémoire.
 */
const MAX_PERIOD_DAYS = 731

export interface StayBreakdownWindow {
  from: Date
  /** Borne exclue : lendemain du dernier jour compté. `null` : sans borne. */
  until: Date | null
  months: number | null
}

/**
 * Période de la répartition : les `months` derniers mois, mois en cours
 * compris, ou une période libre entre deux dates.
 *
 * Les dates sont des jours entiers, en UTC — l'heure d'Abidjan. Le dernier
 * jour est inclus ; sans fin, la période court jusqu'à aujourd'hui.
 */
export function stayBreakdownWindow(
  input: { months?: number; from?: Date; to?: Date },
  now: Date = new Date()
): StayBreakdownWindow {
  if (!input.from) {
    const months = Math.min(24, Math.max(1, input.months ?? 12))
    return { from: monthWindow(now, -(months - 1)).from, until: null, months }
  }

  const from = startOfDay(input.from)
  const last = startOfDay(input.to ?? now)
  if (last.getTime() < from.getTime()) {
    throw new DomainError(
      'invalid_period',
      'La date de fin est antérieure à la date de début.',
      422
    )
  }

  const until = new Date(last.getTime() + DAY_MS)
  if ((until.getTime() - from.getTime()) / DAY_MS > MAX_PERIOD_DAYS) {
    throw new DomainError('period_too_long', 'La période ne peut pas dépasser deux ans.', 422)
  }

  return { from, until, months: null }
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function stayBucketOf(booking: Pick<StayBreakdownBooking, 'stay_type' | 'days_count'>) {
  if (booking.stay_type === 'passage') return 'passage'
  if (booking.stay_type === 'half_day') return 'half_day'

  // Type inconnu ou absent : séjour complet, comme le repli de
  // `BookingRepository.toDto` sur les réservations antérieures au comptoir.
  const days = booking.days_count
  if (days >= 30) return 'thirty_days_plus'
  if (days >= 7) return 'seven_to_twenty_nine_days'
  if (days >= 2) return 'two_to_six_days'
  return 'one_day'
}

/** Toutes les tranches figurent, même vides : le graphique garde ses lignes. */
export function buildStayBuckets(bookings: readonly StayBreakdownBooking[]): StayBucketDto[] {
  const totals = new Map<StayBucket, { bookings: number; revenue: number; occupancy: number }>(
    STAY_BUCKETS.map((key) => [key, { bookings: 0, revenue: 0, occupancy: 0 }])
  )

  for (const booking of bookings) {
    const bucket = totals.get(stayBucketOf(booking))!
    const stayType = (
      booking.stay_type === 'passage' || booking.stay_type === 'half_day'
        ? booking.stay_type
        : 'full_day'
    ) as StayType

    bucket.bookings += 1
    bucket.revenue += booking.total_amount ?? 0
    // Un séjour de zéro jour (historique incomplet) immobilise au moins son unité.
    bucket.occupancy += stayTypeOccupancyDays(stayType, Math.max(1, booking.days_count))
  }

  const total = bookings.length

  return STAY_BUCKETS.map((key) => {
    const bucket = totals.get(key)!
    return {
      key,
      bookings: bucket.bookings,
      share_percent: total === 0 ? 0 : Math.round((bucket.bookings / total) * 1000) / 10,
      revenue: bucket.revenue,
      occupancy_days: Math.round(bucket.occupancy * 100) / 100,
    }
  })
}
