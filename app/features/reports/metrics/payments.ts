/**
 * Encaissements d'une réservation.
 *
 * L'argent reçu se lit **exclusivement** sur les `booking_payments` de statut
 * `success`. Le champ `received_amount` de la réservation porte, malgré son
 * nom, le montant *négocié* — il alimente `total_amount`, et le prendre pour
 * l'encaissé afficherait toute réservation comme soldée.
 */

/** Paiement réduit à ce dont le calcul a besoin. */
export interface SettlementPayment {
  booking_id: string
  amount: number
  status: string
}

export interface BookingSettlement {
  booking_id: string
  total_amount: number
  settled_amount: number
  outstanding_amount: number
  is_settled: boolean
}

/**
 * Seul `success` vaut encaissement : `pending`, `failed`, `expired` et
 * `cancelled` sont des tentatives, et les sommer gonflerait le total de
 * paiements qui n'ont jamais eu lieu.
 */
const SETTLED_STATUS = 'success'

export function sumSettledPayments(
  payments: readonly SettlementPayment[],
  bookingId: string
): number {
  return payments
    .filter((payment) => payment.booking_id === bookingId && payment.status === SETTLED_STATUS)
    .reduce((total, payment) => total + payment.amount, 0)
}

export function buildSettlement(
  booking: { id: string; total_amount: number },
  payments: readonly SettlementPayment[]
): BookingSettlement {
  const settled = sumSettledPayments(payments, booking.id)

  // Un trop-perçu — arrhes conservées, réservation raccourcie — ne doit pas
  // produire un reste négatif qui se soustrairait du total du rapport.
  const outstanding = Math.max(0, booking.total_amount - settled)

  return {
    booking_id: booking.id,
    total_amount: booking.total_amount,
    settled_amount: settled,
    outstanding_amount: outstanding,
    is_settled: outstanding === 0,
  }
}
