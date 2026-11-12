import { ARRIVAL_QR_PREFIX } from './arrival_code.ts'

/**
 * Données de la réservation réservées au client : son code d'arrivée et
 * l'acompte tel qu'il l'a payé.
 *
 * Portées par le DTO sous une clé `Symbol`, comme la part de RESI
 * (`booking_commission.ts`) : `JSON.stringify` l'ignore, si bien que la vue
 * du propriétaire ne peut pas les divulguer par mégarde. Le propriétaire qui
 * connaîtrait le PIN pourrait enregistrer une arrivée sans le client ; et
 * l'acompte client, rapproché de sa part, lui dévoilerait la commission.
 */
export const BOOKING_ARRIVAL = Symbol('booking_arrival')

export interface BookingArrival {
  /** Contenu du QR présenté au comptoir ; `null` sans code (comptoir, historique). */
  qr: string | null
  pin: string | null
  /** Acompte à payer par Wave, côté client ; `null` en paiement total. */
  online_deposit_amount: number | null
}

interface ArrivalFields {
  check_in_token?: string
  check_in_pin?: string
  online_deposit_amount?: number
}

export function readBookingArrival(doc: ArrivalFields): BookingArrival {
  return {
    qr: doc.check_in_token ? `${ARRIVAL_QR_PREFIX}${doc.check_in_token}` : null,
    pin: doc.check_in_pin ?? null,
    online_deposit_amount: doc.online_deposit_amount ?? null,
  }
}

type WithArrival = { [BOOKING_ARRIVAL]?: BookingArrival }

export function attachArrival<T extends object>(dto: T, arrival: BookingArrival): T {
  return Object.assign(dto, { [BOOKING_ARRIVAL]: arrival })
}

export function arrivalOf(dto: object): BookingArrival | null {
  return (dto as WithArrival)[BOOKING_ARRIVAL] ?? null
}
