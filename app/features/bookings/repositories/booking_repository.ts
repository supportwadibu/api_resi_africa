import Booking, { type BookingRecord } from '#models/booking'
import Property from '#models/property'

import {
  countInProgress,
  countUpcoming,
  growthPercent,
  monthWindow,
  occupancyForWindow,
  revenueForMonth,
} from '../booking_stats.ts'

import type {
  BookingDto,
  BookingStatsDto,
  BookingStatus,
  CreateCalculatedBookingInput,
  ListBookingsInput,
  UpdateCalculatedBookingInput,
} from '../dto/booking.dto.ts'

export class BookingRepository {
  static toDto(doc: BookingRecord): BookingDto {
    return {
      id: doc._id,
      property_id: doc.property_id,
      // Absent des réservations antérieures aux résidences.
      residence_id: doc.residence_id ?? null,
      owner_id: doc.owner_id,
      client_id: doc.client_id,
      status: doc.status,
      start_date: doc.start_date,
      end_date: doc.end_date,
      // `nights_count` : nom porté par les réservations enregistrées avant le
      // passage à une facturation en jours d'occupation. Le repli évite de
      // renvoyer une durée nulle sur l'historique.
      days_count: doc.days_count ?? doc.nights_count ?? 0,
      daily_price: doc.daily_price,
      // Absente de l'historique, où la remise était portée par des tarifs
      // hebdomadaire et mensuel distincts.
      duration_discount_percent: doc.duration_discount_percent ?? 0,
      subtotal_amount: doc.subtotal_amount,
      discount_amount: doc.discount_amount,
      total_amount: doc.total_amount,
      promo_code: doc.promo_code ?? null,
      message: doc.message ?? null,
      cancelled_at: doc.cancelled_at ?? null,
      completed_at: doc.completed_at ?? null,
      cancellation_reason: doc.cancellation_reason ?? null,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      // Les réservations antérieures ne portent pas ces champs : le repli les
      // ramène au comportement d'origine plutôt que de livrer `undefined`.
      source: doc.source ?? 'online',
      stay_type: doc.stay_type ?? 'full_day',
      check_in_at: doc.check_in_at ?? doc.start_date,
      check_out_at: doc.check_out_at ?? doc.end_date,
      // Sans repli : une réservation non clôturée n'a pas de sortie constatée,
      // et la remplacer par la sortie prévue laisserait croire au départ.
      actual_check_out_at: doc.actual_check_out_at,
      expected_amount: doc.expected_amount ?? doc.total_amount,
      received_amount: doc.received_amount ?? doc.total_amount,
      deposit_amount: doc.deposit_amount ?? 0,
      sync_status: doc.sync_status ?? 'synced',
      client: doc.client_snapshot
        ? {
            id: doc.client_id,
            full_name: doc.client_snapshot.full_name,
            phone: doc.client_snapshot.phone,
          }
        : undefined,
    }
  }

  async getPropertyOwner(property_id: string): Promise<string | null> {
    const property = await Property.findById(property_id)
    if (!property) return null
    if (property.status !== 'published' || property.visibility.is_public !== true) return null
    return property.owner_id
  }

  async getAvailablePropertyForBooking(property_id: string) {
    const property = await Property.findById(property_id)
    if (!property) return null
    if (property.status !== 'published' || property.visibility.is_public !== true) return null
    return property
  }

  /**
   * Retire un bien du catalogue.
   *
   * La condition « seulement s'il est encore publié » était portée par le
   * filtre de `updateOne` côté Mongo ; elle devient une vérification explicite.
   * Ce chemin est utilisé hors création de réservation — celle-ci passe par la
   * transaction de `Booking.createWithPropertyReservation`, qui garantit
   * l'atomicité.
   */
  async markPropertyAsUnavailable(property_id: string): Promise<boolean> {
    const property = await Property.findById(property_id)
    if (!property || property.status !== 'published' || !property.visibility.is_public) {
      return false
    }

    await Property.findByIdAndUpdate(property_id, {
      'status': 'reserved',
      'visibility.is_public': false,
    })
    return true
  }

  async markPropertyAsAvailable(property_id: string): Promise<boolean> {
    const property = await Property.findById(property_id)
    if (!property || property.status !== 'reserved') return false

    await Property.findByIdAndUpdate(property_id, {
      'status': 'published',
      'visibility.is_public': true,
    })
    return true
  }

  /**
   * Crée une réservation, réserve le bien et décompte le code promo dans une
   * seule transaction Firestore — la propriété d'atomicité de l'ancienne
   * `session.withTransaction` est conservée.
   */
  async create(input: CreateCalculatedBookingInput): Promise<BookingDto> {
    const booking = await Booking.createWithPropertyReservation({
      property_id: input.property_id,
      residence_id: input.residence_id ?? null,
      owner_id: input.owner_id,
      client_id: input.client_id,
      start_date: input.start_date,
      end_date: input.end_date,
      days_count: input.days_count,
      daily_price: input.daily_price,
      duration_discount_percent: input.duration_discount_percent,
      subtotal_amount: input.subtotal_amount,
      discount_amount: input.discount_amount,
      total_amount: input.total_amount,
      promo_code: input.promo_code ?? null,
      promo_code_id: input.promo_code_id ?? null,
      message: input.message ?? null,
    })

    return BookingRepository.toDto(booking)
  }

  async findById(id: string): Promise<BookingDto | null> {
    const doc = await Booking.findById(id)
    return doc ? BookingRepository.toDto(doc) : null
  }

  async getPropertyForPricing(property_id: string) {
    return Property.findById(property_id)
  }

  async updateStatus(
    id: string,
    status: BookingStatus,
    data: Record<string, unknown> = {},
    scope: { owner_id?: string; client_id?: string } = {}
  ): Promise<BookingDto | null> {
    const doc = await Booking.findOneAndUpdate(id, { ...data, status }, scope)
    return doc ? BookingRepository.toDto(doc) : null
  }

  async updateBooking(
    id: string,
    input: UpdateCalculatedBookingInput,
    client_id: string
  ): Promise<BookingDto | null> {
    const doc = await Booking.findOneAndUpdate(id, { ...input }, { client_id, status: 'confirmed' })
    return doc ? BookingRepository.toDto(doc) : null
  }

  /**
   * Prolonge un séjour si le segment gagné est libre.
   *
   * Le contrôle de chevauchement est délégué au modèle, qui le tient dans la
   * même transaction que l'écriture — un contrôle fait ici, avant l'appel,
   * laisserait passer deux prolongations concurrentes.
   */
  async extendBooking(
    id: string,
    input: UpdateCalculatedBookingInput,
    scope: { owner_id?: string; client_id?: string },
    detectConflict: (active: BookingRecord[]) => boolean
  ): Promise<BookingDto | null> {
    const doc = await Booking.extendBooking(id, { ...input }, scope, detectConflict)
    return doc ? BookingRepository.toDto(doc) : null
  }

  async paginate(input: ListBookingsInput): Promise<{
    data: BookingDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await Booking.paginate(
      {
        client_id: input.client_id || undefined,
        owner_id: input.owner_id || undefined,
        property_id: input.property_id || undefined,
        status: input.status,
      },
      { limit: perPage, offset: (page - 1) * perPage }
    )

    return {
      data: data.map((doc) => BookingRepository.toDto(doc)),
      total,
      page,
      perPage,
    }
  }

  /**
   * Chiffres du tableau de bord : occupation, séjours à venir et en cours,
   * revenu du mois rapporté au précédent.
   *
   * Une seule lecture couvre les deux mois — `findForRevenue` filtre en
   * mémoire, si bien que demander chaque mois séparément doublerait les
   * lectures Firestore pour le même jeu de documents.
   */
  async stats(owner_id: string, now: Date = new Date()): Promise<BookingStatsDto> {
    const current = monthWindow(now)
    const previous = monthWindow(now, -1)

    // Sans borne haute : les compteurs portent aussi sur les séjours à venir
    // au-delà du mois en cours, qu'une fenêtre fermée écarterait. La lecture
    // reste unique, `findForRevenue` filtrant en mémoire.
    const [bookings, propertyStats] = await Promise.all([
      Booking.findForRevenue(owner_id, { from: previous.from }),
      Property.statsByOwner(owner_id),
    ])

    const currentRevenue = revenueForMonth(bookings, current)
    const previousRevenue = revenueForMonth(bookings, previous)

    return {
      // `published + rented` : un bien réservé passe en « rented » et sort des
      // publiés, alors qu'il fait toujours partie du parc exploité.
      taux_occupation: occupancyForWindow(
        bookings,
        propertyStats.published + propertyStats.rented,
        current
      ),
      upcoming: countUpcoming(bookings, now),
      in_progress: countInProgress(bookings),
      revenue: {
        current_month: currentRevenue,
        previous_month: previousRevenue,
        growth_percent: growthPercent(currentRevenue, previousRevenue),
      },
    }
  }
}

export default BookingRepository
