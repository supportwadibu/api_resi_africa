import type { BookingPaymentStatus } from '#features/booking_payments/dto/booking_payment.dto'

import type { BookingDto } from './dto/booking.dto.ts'

interface PropertyLike {
  id: string
  title: string
  address?: { city?: string }
  media?: { images?: string[] }
}

interface PaymentLike {
  booking_id: string
  status: BookingPaymentStatus
  created_at: Date
}

/**
 * Habille la liste du client : résumé du bien et dernier état de paiement.
 *
 * Fonction pure, séparée du use case : les lectures se font en lot à côté, et
 * l'assemblage se teste sans Firestore.
 */
export function attachClientView(
  bookings: readonly BookingDto[],
  properties: Map<string, PropertyLike>,
  payments: readonly PaymentLike[]
): BookingDto[] {
  const latest = new Map<string, PaymentLike>()
  for (const payment of payments) {
    const current = latest.get(payment.booking_id)
    if (!current || payment.created_at > current.created_at) {
      latest.set(payment.booking_id, payment)
    }
  }

  return bookings.map((booking) => {
    const property = properties.get(booking.property_id)
    return {
      ...booking,
      ...(property
        ? {
            property: {
              id: property.id,
              title: property.title,
              // Biens historiques sans adresse ni médias : le résumé reste
              // affichable plutôt que de faire tomber tout l'historique.
              city: property.address?.city ?? '',
              image: property.media?.images?.[0] ?? null,
            },
          }
        : {}),
      payment_status: latest.get(booking.id)?.status ?? null,
    }
  })
}
