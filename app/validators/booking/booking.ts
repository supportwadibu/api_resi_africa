import vine from '@vinejs/vine'

import { BOOKING_STATUSES } from '#models/booking'
import { STAY_TYPES } from '#features/bookings/stay_type'

export const createBookingValidator = vine.compile(
  vine.object({
    start_date: vine.date(),
    end_date: vine.date(),
    promo_code: vine.string().trim().maxLength(50).optional(),
    message: vine.string().trim().maxLength(1000).optional(),
  })
)

export const updateBookingValidator = vine.compile(
  vine.object({
    end_date: vine.date(),
    promo_code: vine.string().trim().maxLength(50).optional(),
    message: vine.string().trim().maxLength(1000).optional(),
  })
)

export const listBookingsValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().optional(),
    status: vine.enum(BOOKING_STATUSES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)

export const cancelBookingValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().maxLength(500).optional(),
  })
)

/**
 * L'appareil envoie un instant ISO 8601 complet (`2026-08-31T10:30:00.000Z`).
 * Sans `formats`, `vine.date()` n'accepte qu'une date calendaire et rejette
 * toute saisie comptoir en 422 : l'heure porte le type de séjour — un passage
 * dure 4 h, une demi-journée 12 h — et ne peut donc pas être tronquée.
 */
export const createOwnerBookingValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().minLength(1),
    client_id: vine.string().trim().minLength(1),
    stay_type: vine.enum(STAY_TYPES),
    check_in_at: vine.date({ formats: ['iso8601'] }),
    check_out_at: vine.date({ formats: ['iso8601'] }).optional(),
    received_amount: vine.number().min(0).optional(),
    /**
     * Prix négocié par unité du type de séjour. Prime sur `received_amount` :
     * le serveur en tire le total sur **sa** durée, et le fige pour tarifer
     * une prolongation.
     */
    agreed_unit_price: vine.number().min(0).optional(),
    deposit_amount: vine.number().min(0).optional(),
    message: vine.string().trim().maxLength(500).optional(),
    is_check_in: vine.boolean().optional(),
    /** UUID généré par l'appareil ; porte l'idempotence de la synchronisation. */
    client_request_id: vine.string().trim().maxLength(64).optional(),
    /** Apporteur d'affaire, saisi librement : il n'a pas de compte. */
    referrer: vine
      .object({
        name: vine.string().trim().minLength(2).maxLength(120),
        phone: vine.string().trim().maxLength(30).optional(),
      })
      .optional(),
  })
)

/**
 * PATCH /proprio/bookings/:id/extend
 *
 * Même format ISO 8601 que la création : l'heure de sortie porte le type de
 * séjour et ne peut pas être tronquée à une date calendaire.
 */
export const extendOwnerBookingValidator = vine.compile(
  vine.object({
    check_out_at: vine.date({ formats: ['iso8601'] }),
    /** Montant renégocié. À défaut, le nouveau montant attendu s’applique. */
    received_amount: vine.number().min(0).optional(),
  })
)

/**
 * PUT /proprio/bookings/:id — PUT /gerant/bookings/:id
 *
 * La réservation complète, telle que le formulaire de modification la montre.
 * `PUT` et non `PATCH` : le mobile renvoie tout, et le serveur recalcule
 * montants et chevauchement sur l'ensemble — un patch partiel ne dirait pas
 * sur quelle période contrôler.
 */
export const updateOwnerBookingValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().minLength(1),
    stay_type: vine.enum(STAY_TYPES),
    check_in_at: vine.date({ formats: ['iso8601'] }),
    check_out_at: vine.date({ formats: ['iso8601'] }).optional(),
    /** Prix convenu du séjour. À défaut, le montant attendu s'applique. */
    received_amount: vine.number().min(0).optional(),
    /** Prix négocié par unité, même règle qu'à la création. */
    agreed_unit_price: vine.number().min(0).optional(),
    deposit_amount: vine.number().min(0).optional(),
    message: vine.string().trim().maxLength(500).nullable().optional(),
  })
)

/**
 * Clôture d'un séjour. Corps entièrement optionnel : les versions du mobile
 * déjà installées clôturent sans corps, ce qui vaut séjour mené à terme.
 */
export const checkOutBookingValidator = vine.compile(
  vine.object({
    full_stay: vine.boolean().optional(),
    actual_check_out_at: vine.date({ formats: ['iso8601'] }).optional(),
    final_amount: vine.number().min(0).optional(),
  })
)

/**
 * PATCH /proprio/bookings/:id/check-in — PATCH /gerant/bookings/:id/check-in
 *
 * Corps optionnel : l'heure d'arrivée n'est envoyée que par une saisie faite
 * hors ligne, qui part plus tard. Sans elle, l'arrivée vaut l'heure serveur.
 */
export const checkInBookingValidator = vine.compile(
  vine.object({
    actual_check_in_at: vine.date({ formats: ['iso8601'] }).optional(),
  })
)

export const checkOutPreviewValidator = vine.compile(
  vine.object({
    at: vine.date({ formats: ['iso8601'] }).optional(),
  })
)

export const availabilityValidator = vine.compile(
  vine.object({
    property_id: vine.string().trim().minLength(1),
    // Même format ISO 8601 que la création : `getAvailability` envoie des
    // bornes horodatées, pas des dates calendaires.
    from: vine.date({ formats: ['iso8601'] }).optional(),
    to: vine.date({ formats: ['iso8601'] }).optional(),
  })
)

/**
 * POST /gerant/bookings/:id/payments
 *
 * Versement reçu au comptoir. Le montant est positif : un encaissement négatif
 * serait un remboursement, qui relève d'un avoir et non de cette route.
 */
export const recordBookingPaymentValidator = vine.compile(
  vine.object({
    amount: vine.number().positive(),
  })
)

/**
 * GET /admin/bookings
 *
 * Tous propriétaires confondus. Chaque combinaison de filtres retenue est
 * couverte par un index de `firestore.indexes.json`.
 */
export const listPlatformBookingsValidator = vine.compile(
  vine.object({
    owner_id: vine.string().trim().minLength(1).optional(),
    property_id: vine.string().trim().minLength(1).optional(),
    client_id: vine.string().trim().minLength(1).optional(),
    status: vine.enum(BOOKING_STATUSES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
