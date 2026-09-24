import { BookingRepository } from '#features/bookings/repositories/booking_repository'
import { collection, COLLECTIONS, countQuery, type CollectionName } from '#firebase/firestore'
import Booking, { BOOKING_STATUSES } from '#models/booking'
import { PROPERTY_STATUSES } from '#models/property'
import { ROLE_NAMES } from '#models/role'
import { OWNER_VALIDATION_STATUSES } from '#utils/enums/owner_validation_status'
import { SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'

import type { StatsBooking } from '#features/bookings/booking_stats'
import type { PlatformStatsDto } from '../dto/platform_stats.dto.ts'

type Counters = Omit<PlatformStatsDto, 'generated_at' | 'revenue' | 'occupancy_rate'>

/**
 * Comptages de la plateforme.
 *
 * Tout passe par des agrégats serveur (`count()`) : aucun document n'est
 * rapatrié, et le coût ne dépend pas du volume de la collection. Les
 * répartitions par statut sont des égalités simples, que Firestore sert sans
 * index composite.
 */
export class PlatformStatsRepository {
  private count(name: CollectionName, filters: Array<[string, unknown]> = []): Promise<number> {
    let query = collection(name) as FirebaseFirestore.Query
    for (const [field, value] of filters) query = query.where(field, '==', value)
    return countQuery(query)
  }

  /** Un agrégat par valeur possible du champ, lancés ensemble. */
  private async countByValue<K extends string>(
    name: CollectionName,
    field: string,
    values: readonly K[],
    extra: Array<[string, unknown]> = []
  ): Promise<Record<K, number>> {
    const counts = await Promise.all(
      values.map((value) => this.count(name, [...extra, [field, value]]))
    )

    return Object.fromEntries(values.map((value, i) => [value, counts[i]])) as Record<K, number>
  }

  async counters(monthStart: Date): Promise<Counters> {
    const [
      usersTotal,
      usersByRole,
      usersNew,
      usersInactive,
      owners,
      residences,
      properties,
      propertiesByStatus,
      bookingsTotal,
      bookingsByStatus,
      bookingsOffline,
      subscriptions,
      feedbacksNew,
    ] = await Promise.all([
      this.count(COLLECTIONS.users),
      // L'identifiant du rôle est son nom : voir `models/role.ts`.
      this.countByValue(COLLECTIONS.users, 'role_id', ROLE_NAMES),
      countQuery(collection(COLLECTIONS.users).where('metadata.created_at', '>=', monthStart)),
      this.count(COLLECTIONS.users, [['is_active', false]]),
      this.countByValue(COLLECTIONS.users, 'owner_status', OWNER_VALIDATION_STATUSES, [
        ['role_id', 'proprio'],
      ]),
      this.count(COLLECTIONS.residences),
      this.count(COLLECTIONS.properties),
      this.countByValue(COLLECTIONS.properties, 'status', PROPERTY_STATUSES),
      this.count(COLLECTIONS.bookings),
      this.countByValue(COLLECTIONS.bookings, 'status', BOOKING_STATUSES),
      this.count(COLLECTIONS.bookings, [['source', 'offline']]),
      this.countByValue(COLLECTIONS.subscriptions, 'status', SUBSCRIPTION_STATUSES),
      // Les tout premiers retours n'ont pas de `status` et échappent à ce
      // compte ; ils sont antérieurs au back-office et ne sont plus à traiter.
      this.count(COLLECTIONS.feedbacks, [['status', 'new']]),
    ])

    return {
      users: {
        total: usersTotal,
        by_role: usersByRole,
        new_this_month: usersNew,
        inactive: usersInactive,
      },
      owners,
      catalog: {
        residences,
        properties,
        properties_by_status: propertiesByStatus,
      },
      bookings: {
        total: bookingsTotal,
        by_status: bookingsByStatus,
        // Pas de requête `source == 'online'` : l'historique ne porte pas le
        // champ et Firestore ignore les documents qui en sont dépourvus.
        by_source: {
          online: Math.max(0, bookingsTotal - bookingsOffline),
          offline: bookingsOffline,
        },
      },
      subscriptions,
      feedbacks: { new: feedbacksNew },
    }
  }

  /** Réservations non annulées pouvant toucher la période commençant à `from`. */
  async bookingsTouching(from: Date): Promise<StatsBooking[]> {
    const docs = await Booking.findEndingAfter(from)

    // Même projection que le tableau de bord propriétaire : `days_count`,
    // `stay_type` et les montants y reçoivent leurs replis historiques.
    return docs.map((doc) => BookingRepository.toDto(doc))
  }
}

export default PlatformStatsRepository
