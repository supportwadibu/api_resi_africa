import type { BookingPaymentStatus } from '#features/booking_payments/dto/booking_payment.dto'

import { toClientBooking } from '#features/commissions/booking_commission'

import type { OwnerContact } from '#features/users/repositories/user_repository'

import type { BookingDto, OwnerContactDto } from './dto/booking.dto.ts'

interface PropertyLike {
  id: string
  title: string
  address?: { street?: string; city?: string }
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
  payments: readonly PaymentLike[],
  owners: Map<string, OwnerContact> = new Map()
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
      // Prix vus et payés par le client, et non la part du propriétaire.
      ...toClientBooking(booking),
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
      owner_contact: isContactRevealed(booking, latest.get(booking.id)?.status ?? null)
        ? toOwnerContact(owners.get(booking.owner_id), property)
        : null,
    }
  })
}

/**
 * Le client peut-il joindre le propriétaire ?
 *
 * Une fois engagé seulement — payé en ligne, ou séjour commencé ou fini —
 * et jamais pour une réservation annulée : la fiche publique cache le
 * propriétaire pour que la réservation passe par RESI.
 */
export function isContactRevealed(
  booking: Pick<BookingDto, 'status'>,
  paymentStatus: BookingPaymentStatus | null
): boolean {
  if (booking.status === 'cancelled') return false
  return (
    paymentStatus === 'success' ||
    booking.status === 'in_progress' ||
    booking.status === 'completed'
  )
}

function toOwnerContact(
  owner: OwnerContact | undefined,
  property: PropertyLike | undefined
): OwnerContactDto | null {
  if (!owner) return null
  return {
    full_name: owner.full_name,
    phone: owner.phone,
    address: joinAddress(owner.address, owner.city),
    property_address: joinAddress(property?.address?.street, property?.address?.city),
  }
}

function joinAddress(street?: string | null, city?: string | null): string | null {
  const parts = [street?.trim(), city?.trim()].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(', ') : null
}
