import { BookingRepository } from '#features/bookings/repositories/booking_repository'
import {
  collection,
  COLLECTIONS,
  countQuery,
  toDocs,
  type CollectionName,
} from '#firebase/firestore'
import Booking, { BOOKING_STATUSES } from '#models/booking'
import { PROPERTY_STATUSES } from '#models/property'
import { ROLE_NAMES } from '#models/role'
import { OWNER_VALIDATION_STATUSES } from '#utils/enums/owner_validation_status'
import { SUBSCRIPTION_STATUSES } from '#utils/enums/subscription_status'
import PaymentHistory from '#models/payment_history'
import Plan from '#models/plan'
import Subscription from '#models/subscription'
import { readPaidPlanTier } from '#features/plans/plan_tier'
import { ownerAmountOf, sponsorshipCreditOf } from '#features/booking_payments/sponsorship_credit'
import type { BookingPaymentDocument } from '#models/booking_payment'
import type { SponsorshipTransactionDocument } from '#models/sponsorship'
import type { WithdrawalRequestDocument } from '#models/wallet'

import type { StatsBooking } from '#features/bookings/booking_stats'
import type { PlatformStatsDto } from '../dto/platform_stats.dto.ts'
import type { StayBreakdownBooking } from '../stay_type_breakdown.ts'
import { commissionEvents, type RevenueEvent } from '../platform_revenue.ts'
import type { EarnedPayment, PaidSubscription, TrialSubscription } from '../subscription_revenue.ts'

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
  /**
   * Données du revenu d'abonnement : paiements encaissés depuis `from`,
   * abonnements payants et essais en cours, prix des forfaits proposés.
   *
   * La durée d'une période vient du plan de l'abonnement, retiré compris ;
   * 30 jours à défaut — un abonnement dont le plan a été supprimé reste
   * mensuel, le seul cas vendu jusqu'ici.
   */
  async subscriptionRevenueInputs(from: Date): Promise<{
    payments: EarnedPayment[]
    paidSubscriptions: PaidSubscription[]
    trials: TrialSubscription[]
    planPrices: number[]
  }> {
    const [payments, active, trials, plans] = await Promise.all([
      PaymentHistory.findPaidSince(from),
      Subscription.findByStatus('active'),
      Subscription.findByStatus('trial'),
      Plan.findAll(),
    ])

    const durations = new Map(plans.map((plan) => [plan._id, plan.duration_days]))

    return {
      payments: payments.flatMap((p) =>
        p.paid_at ? [{ amount: Number(p.amount), paid_at: p.paid_at }] : []
      ),
      // Un essai porté en `active` par l'historique ne rapporte rien.
      paidSubscriptions: active
        .filter((s) => !s.is_trial)
        .map((s) => ({
          amount: Number(s.amount),
          end_date: s.end_date,
          plan_tier: readPaidPlanTier(s.plan_tier),
          duration_days: (s.plan_id ? durations.get(s.plan_id) : undefined) ?? 30,
        })),
      trials: trials.map((s) => ({ end_date: s.end_date })),
      planPrices: plans.filter((plan) => plan.is_active).map((plan) => plan.price),
    }
  }

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

  /**
   * Réservations non annulées commencées depuis `from`, d'un propriétaire ou
   * de toute la plateforme.
   *
   * Lues par `end_date` — la requête existante, sans index composite — puis
   * restreintes au début de séjour : une réservation commencée depuis `from`
   * finit forcément après.
   */
  /** Réservations commencées à partir de `from`, et avant `until` (exclu) s'il est donné. */
  async bookingsStartedSince(
    from: Date,
    ownerId?: string | null,
    until?: Date | null
  ): Promise<StayBreakdownBooking[]> {
    const docs = await Booking.findEndingAfter(from)

    return docs
      .map((doc) => BookingRepository.toDto(doc))
      .filter(
        (b) =>
          b.start_date >= from &&
          (!until || b.start_date < until) &&
          (!ownerId || b.owner_id === ownerId)
      )
  }

  /**
   * Mouvements du chiffre d'affaires de RESI depuis `from`.
   *
   * Une requête d'intervalle sur un seul champ par collection : Firestore
   * l'indexe d'office, sans index composite à déclarer. Statuts et types sont
   * filtrés ensuite, sur un volume borné par la période.
   */
  async platformRevenueEvents(from: Date): Promise<RevenueEvent[]> {
    const since = <T>(name: CollectionName, field: string) =>
      collection(name)
        .where(field, '>=', from)
        .get()
        .then((snapshot) => toDocs<T & object>(snapshot.docs))

    const [paid, refunded, subscriptions, withdrawals, rewards] = await Promise.all([
      since<BookingPaymentDocument>(COLLECTIONS.bookingPayments, 'paid_at'),
      since<BookingPaymentDocument>(COLLECTIONS.bookingPayments, 'refunded_at'),
      PaymentHistory.findPaidSince(from),
      since<WithdrawalRequestDocument>(COLLECTIONS.withdrawalRequests, 'processed_at'),
      since<SponsorshipTransactionDocument>(COLLECTIONS.sponsorshipTransactions, 'created_at'),
    ])

    // Un paiement payé puis remboursé dans la période sort des deux requêtes.
    const payments = new Map([...paid, ...refunded].map((p) => [p._id, p]))
    const events: RevenueEvent[] = [...payments.values()].flatMap((p) =>
      commissionEvents({
        status: p.status,
        paid_at: p.paid_at,
        refunded_at: p.refunded_at ?? null,
        // Signée : un code promo plus généreux que la commission coûte à RESI.
        commission: p.amount + sponsorshipCreditOf(p) - ownerAmountOf(p),
      })
    )

    for (const p of subscriptions) {
      if (p.paid_at)
        events.push({ source: 'subscriptions', amount: Number(p.amount), at: p.paid_at })
    }
    for (const w of withdrawals) {
      if (w.status === 'paid' && w.processed_at && w.fee > 0) {
        events.push({ source: 'withdrawal_fees', amount: w.fee, at: w.processed_at })
      }
    }
    // Gain crédité au parrain : une dépense de RESI ; sa reprise, une recette.
    for (const t of rewards) {
      if (t.type === 'reward' || t.type === 'reward_reversal') {
        events.push({ source: 'sponsorship_rewards', amount: -t.balance_delta, at: t.created_at })
      }
    }
    return events
  }
}

export default PlatformStatsRepository
