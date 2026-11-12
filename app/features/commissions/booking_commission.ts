import { arrivalOf } from '#features/bookings/booking_arrival'
import type { PaymentOption } from '#features/deposits/deposit_rules'
import { markupDailyPrice, type CommissionMode } from './commission_rules.ts'

/**
 * Part de RESI sur une réservation, telle que figée à sa création.
 *
 * Portée par le DTO de réservation sous une clé `Symbol` : `JSON.stringify`
 * ignore ces clés, si bien qu'aucune réponse ne peut la divulguer par
 * mégarde — le propriétaire ne voit que ce qu'il touche, quel que soit le
 * chemin qui lui renvoie une réservation. Seules les vues client et admin la
 * lisent, explicitement. La décomposition d'objet (`{ ...dto }`) recopie les
 * clés `Symbol` : la part survit aux habillages de la liste.
 */
export const BOOKING_COMMISSION = Symbol('booking_commission')

export interface BookingCommission {
  mode: CommissionMode
  value: number
  /** Majoration avant code promo : prix client moins prix propriétaire. */
  amount: number
  client_daily_price: number
  client_subtotal_amount: number
  /** Ce que paie le client, code promo déduit. */
  client_total_amount: number
  /**
   * Ce que RESI garde : ce que paie le client moins ce que touche le
   * propriétaire. Négatif quand un code promo dépasse la majoration — RESI
   * offre alors la différence.
   */
  net_amount: number
  /** Code promo, pris sur la part de RESI : la vue propriétaire ne le montre pas. */
  discount_amount: number
  promo_code: string | null
}

interface CommissionFields {
  total_amount: number
  discount_amount?: number
  promo_code?: string | null
  commission_mode?: CommissionMode | null
  commission_value?: number | null
  commission_amount?: number | null
  client_daily_price?: number | null
  client_subtotal_amount?: number | null
  client_total_amount?: number | null
}

/**
 * Part de RESI lue sur un document de réservation.
 *
 * `null` sur l'historique antérieur à la commission, sur le comptoir et sur
 * toute réservation prise commission coupée : le client y a payé le prix du
 * propriétaire.
 */
export function readBookingCommission(doc: CommissionFields): BookingCommission | null {
  if (!doc.commission_mode || typeof doc.client_total_amount !== 'number') return null
  return {
    mode: doc.commission_mode,
    value: doc.commission_value ?? 0,
    amount: doc.commission_amount ?? 0,
    client_daily_price: doc.client_daily_price ?? 0,
    client_subtotal_amount: doc.client_subtotal_amount ?? doc.client_total_amount,
    client_total_amount: doc.client_total_amount,
    net_amount: doc.client_total_amount - doc.total_amount,
    discount_amount: doc.discount_amount ?? 0,
    promo_code: doc.promo_code ?? null,
  }
}

type WithCommission = { [BOOKING_COMMISSION]?: BookingCommission | null }

export function attachCommission<T extends object>(
  dto: T,
  commission: BookingCommission | null
): T {
  return Object.assign(dto, { [BOOKING_COMMISSION]: commission })
}

export function commissionOf(dto: object): BookingCommission | null {
  return (dto as WithCommission)[BOOKING_COMMISSION] ?? null
}

/** Ce que paie le client : sa part figée, ou le prix du propriétaire sans commission. */
export function clientAmountOf(doc: CommissionFields): number {
  return readBookingCommission(doc)?.client_total_amount ?? doc.total_amount
}

interface BookingAmounts {
  discount_amount: number
  promo_code: string | null
  daily_price: number
  subtotal_amount: number
  total_amount: number
  sponsorship_credit_amount: number
  amount_due: number
  list_daily_price: number | null
  /** Absents des montages de test antérieurs à l'acompte : paiement total. */
  payment_option?: PaymentOption
  balance_due?: number
  deposit_amount?: number
}

/** Ce que le client lit en plus : son code d'arrivée et son acompte. */
export interface ClientArrivalFields {
  /** Contenu du QR « Démarrer mon séjour » ; `null` sans code. */
  arrival_qr: string | null
  arrival_pin: string | null
  /** Acompte à verser en ligne ; `null` en paiement total. */
  online_deposit_amount: number | null
}

/**
 * Réservation vue par le client : les prix qu'il a vus et qu'il paie, et son
 * code d'arrivée.
 *
 * Les noms de champs ne changent pas — l'application les lit tels quels —,
 * seules leurs valeurs passent du côté client.
 */
export function toClientBooking<T extends BookingAmounts>(dto: T): T & ClientArrivalFields {
  const priced = toClientPrices(dto)
  const arrival = arrivalOf(dto)
  const deposit = arrival?.online_deposit_amount ?? null
  const isDeposit = dto.payment_option === 'deposit' && deposit !== null
  return {
    ...priced,
    // Avec acompte, seul l'acompte se paie en ligne ; le crédit parrainage ne
    // s'y applique pas (`applyStayCredit`).
    ...(isDeposit ? { amount_due: deposit } : {}),
    // Reste à payer au comptoir, vu du client : son prix moins l'acompte et
    // ce qu'il a déjà versé sur place. Le propriétaire lit le même reste sur
    // sa part — les deux tombent juste, la part de RESI étant dans l'acompte.
    ...(dto.balance_due === undefined
      ? {}
      : {
          balance_due: isDeposit
            ? Math.max(0, priced.total_amount - deposit - (dto.deposit_amount ?? 0))
            : 0,
        }),
    arrival_qr: arrival?.qr ?? null,
    arrival_pin: arrival?.pin ?? null,
    online_deposit_amount: isDeposit ? deposit : null,
  }
}

function toClientPrices<T extends BookingAmounts>(dto: T): T {
  const commission = commissionOf(dto)
  if (!commission) return dto
  const rule = { mode: commission.mode, value: commission.value }
  return {
    ...dto,
    daily_price: commission.client_daily_price,
    subtotal_amount: commission.client_subtotal_amount,
    total_amount: commission.client_total_amount,
    discount_amount: commission.discount_amount,
    promo_code: commission.promo_code,
    amount_due: Math.max(0, commission.client_total_amount - dto.sponsorship_credit_amount),
    list_daily_price:
      dto.list_daily_price === null ? null : markupDailyPrice(dto.list_daily_price, rule),
  }
}
