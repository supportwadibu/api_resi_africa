import { stayTypeOccupancyDays, type StayType } from '#features/bookings/stay_type'

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
  months: number
  from: Date
  owner_id: string | null
  total_bookings: number
  buckets: StayBucketDto[]
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
