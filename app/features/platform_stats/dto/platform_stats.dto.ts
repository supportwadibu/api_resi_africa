import type { BookingRevenueStatsDto, BookingStatus } from '#features/bookings/dto/booking.dto'
import type { PropertyStatus } from '#features/properties/dto/property.dto'
import type { RoleName } from '#models/role'
import type { OwnerValidationStatus } from '#utils/enums/owner_validation_status'
import type { SubscriptionStatus } from '#utils/enums/subscription_status'

/**
 * Chiffres du tableau de bord du back-office, toute la plateforme confondue.
 *
 * Les compteurs sont des instantanés au moment de la lecture ; seuls le
 * revenu et l'occupation sont cadrés sur un mois, avec les mêmes règles que
 * le tableau de bord d'un propriétaire — un séjour à cheval sur deux mois est
 * réparti au prorata des jours.
 */
export interface PlatformStatsDto {
  generated_at: Date

  users: {
    total: number
    by_role: Record<RoleName, number>
    /** Comptes créés depuis le 1er du mois, tous rôles confondus. */
    new_this_month: number
    inactive: number
  }

  /** Statut de validation des comptes `proprio`. */
  owners: Record<OwnerValidationStatus, number>

  catalog: {
    residences: number
    properties: number
    properties_by_status: Record<PropertyStatus, number>
  }

  bookings: {
    total: number
    by_status: Record<BookingStatus, number>
    /**
     * Répartition par canal de vente. `online` est déduit du total : les
     * réservations antérieures au comptoir ne portent pas de `source` et sont
     * toutes en ligne.
     */
    by_source: { online: number; offline: number }
  }

  /** Revenu constaté du mois en cours, rapporté au précédent. */
  revenue: BookingRevenueStatsDto

  /**
   * Taux d'occupation du mois sur les jours écoulés, de 0 à 1, rapporté au
   * parc exploité (`published` + `rented`) de toute la plateforme.
   */
  occupancy_rate: number

  subscriptions: Record<SubscriptionStatus, number>

  feedbacks: {
    /** Retours non encore lus par l'équipe. */
    new: number
  }
}

/** Un mois de la série de revenu. */
export interface RevenuePointDto {
  /** `AAAA-MM`, en UTC. */
  month: string
  /** Revenu constaté sur le mois, au prorata des jours. */
  revenue: number
  /** Séjours non annulés dont l'arrivée tombe dans le mois. */
  bookings_started: number
}

export interface RevenueSeriesDto {
  months: number
  /** Du mois le plus ancien au mois en cours. */
  data: RevenuePointDto[]
  total: number
}
