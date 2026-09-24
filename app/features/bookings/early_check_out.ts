import { DomainError } from '#utils/domain_error'

import type { BookingStatus } from '#models/booking'

import type { StayType } from './stay_type.ts'
import { countStayDays } from './stay_pricing.ts'

/**
 * Marge tolérée sur une sortie datée « dans le futur ».
 *
 * L'heure de sortie est saisie sur le téléphone, dont l'horloge peut avancer
 * de quelques minutes sur celle du serveur : sans marge, une sortie « à
 * l'instant » serait refusée comme future.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000

/** Réservation réduite à ce dont le départ anticipé a besoin. */
export interface EarlyCheckOutBooking {
  start_date: Date
  end_date: Date
  check_in_at?: Date
  check_out_at?: Date
  stay_type?: StayType
  days_count?: number
  nights_count?: number
  daily_price: number
  subtotal_amount: number
  total_amount: number
  expected_amount?: number
  received_amount?: number
}

export interface EarlyCheckOutQuote {
  actual_check_out_at: Date
  planned_check_out_at: Date
  planned_days: number
  billed_days: number
  /** Montant réglé, base du prorata et plafond du montant final. */
  paid_amount: number
  /** Prorata proposé au propriétaire, qui peut le retoucher. */
  proposed_amount: number
  /** Remboursement qu'entraînerait le montant proposé. */
  refund_amount: number
}

/**
 * Montant réglé sur la réservation.
 *
 * Même repli que le DTO : les réservations en ligne ne portent pas
 * `received_amount`, leur montant réglé est `total_amount`.
 */
export function paidAmountOf(booking: EarlyCheckOutBooking): number {
  return booking.received_amount ?? booking.total_amount
}

/**
 * Chiffre un départ anticipé à l'instant `departure`.
 *
 * Tout jour entamé reste dû : un séjour de 5 jours quitté après 2 jours et
 * 3 heures en facture 3. Une demi-journée ou un passage se facturent à
 * l'unité — leur montant est indivisible, seule l'heure de sortie bouge.
 *
 * Le prorata porte sur le montant **réglé** et non sur la grille : il reprend
 * ainsi d'office la remise négociée au comptoir, le code promo et la remise de
 * durée du flux en ligne, sans règle propre à chacun.
 *
 * Le séjour minimum n'est pas opposé : il conditionne la prise de réservation,
 * et le client est déjà parti.
 */
export function quoteEarlyCheckOut(
  booking: EarlyCheckOutBooking,
  departure: Date,
  now: Date
): EarlyCheckOutQuote {
  // Repli sur `start_date` / `end_date` : les réservations antérieures à la
  // saisie comptoir ne portent pas `check_in_at` / `check_out_at`.
  const checkIn = booking.check_in_at ?? booking.start_date
  const plannedCheckOut = booking.check_out_at ?? booking.end_date

  if (departure.getTime() <= checkIn.getTime()) {
    throw new DomainError(
      'invalid_departure',
      'L’heure de sortie doit être postérieure à l’entrée du client.',
      422
    )
  }

  if (departure.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    throw new DomainError(
      'departure_in_future',
      'L’heure de sortie ne peut pas être dans le futur.',
      422
    )
  }

  if (departure.getTime() >= plannedCheckOut.getTime()) {
    throw new DomainError(
      'not_early_departure',
      'Cette sortie n’intervient pas avant la fin prévue : clôturez le séjour comme complet.',
      422
    )
  }

  // `nights_count` : nom porté par les réservations antérieures à la
  // facturation en jours. Le dernier repli recompte la période facturée pour
  // ne jamais diviser par zéro.
  const plannedDays = Math.max(
    1,
    booking.days_count ?? booking.nights_count ?? countStayDays(checkIn, plannedCheckOut)
  )

  const paid = paidAmountOf(booking)
  const isFullDay = (booking.stay_type ?? 'full_day') === 'full_day'

  const billedDays = isFullDay
    ? Math.min(plannedDays, Math.max(1, countStayDays(checkIn, departure)))
    : plannedDays

  const proposed = isFullDay ? Math.round((paid * billedDays) / plannedDays) : paid

  return {
    actual_check_out_at: departure,
    planned_check_out_at: plannedCheckOut,
    planned_days: plannedDays,
    billed_days: billedDays,
    paid_amount: paid,
    proposed_amount: proposed,
    refund_amount: paid - proposed,
  }
}

/**
 * Champs écrits par un départ anticipé.
 *
 * À l'inverse de la clôture d'un séjour complet, la période **et** le montant
 * sont réécrits, ensemble. C'est ce couplage qui rend la réécriture sûre :
 * Finance répartit `total_amount` sur `start_date` → `end_date`, et raccourcir
 * l'une sans baisser l'autre concentrerait le revenu sur moins de jours. Les
 * deux bougeant d'un même geste, la répartition reste juste — à ceci près
 * qu'un départ déclaré après la fin d'un mois fait baisser ce mois, ce qui est
 * le reflet exact du remboursement consenti.
 *
 * Les valeurs d'origine sont figées dans `planned_*` : la fiche garde la trace
 * de ce qui avait été vendu, et un litige se tranche sur pièces.
 */
export function buildEarlyCheckOutPatch(
  booking: EarlyCheckOutBooking,
  quote: EarlyCheckOutQuote,
  finalAmount: number,
  now: Date
): Record<string, unknown> & { status: BookingStatus } {
  if (!Number.isFinite(finalAmount) || finalAmount < 0 || finalAmount > quote.paid_amount) {
    throw new DomainError(
      'invalid_final_amount',
      'Le montant retenu doit être compris entre 0 et le montant réglé.',
      422
    )
  }

  const final = Math.round(finalAmount)
  const isFullDay = (booking.stay_type ?? 'full_day') === 'full_day'

  // Le montant grille suit les jours facturés : le garder sur la durée
  // d'origine ferait lire à Finance une remise de 60 % sur un séjour
  // simplement écourté. Une demi-journée ou un passage gardent le leur.
  const expected = isFullDay
    ? Math.round(booking.daily_price * quote.billed_days)
    : (booking.expected_amount ?? booking.subtotal_amount)

  return {
    status: 'completed',
    completed_at: now,
    actual_check_out_at: quote.actual_check_out_at,
    end_date: quote.actual_check_out_at,
    check_out_at: quote.actual_check_out_at,
    days_count: quote.billed_days,
    subtotal_amount: expected,
    expected_amount: expected,
    // `total_amount` suit `received_amount`, même règle qu'à l'encaissement :
    // Finance lit le premier, la fiche le second.
    received_amount: final,
    total_amount: final,
    discount_amount: Math.max(0, expected - final),
    refunded_amount: quote.paid_amount - final,
    planned_check_out_at: quote.planned_check_out_at,
    planned_days_count: quote.planned_days,
    planned_total_amount: quote.paid_amount,
  }
}
