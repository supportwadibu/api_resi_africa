import { toPropertySummary, toResidenceSummary } from '#features/properties/portfolio'

import type { PropertyDto } from '#features/properties/dto/property.dto'
import type { ResidenceDto } from '#features/residences/dto/residence.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'

import type { BookingDto } from './dto/booking.dto.ts'
import type { PlatformBookingClientDto, PlatformBookingDto } from './dto/platform_booking.dto.ts'

/** Fiche du carnet réduite à ce qu'affiche le back-office. */
export interface CarnetClientSummary {
  id: string
  full_name: string
  phone: string
}

/** Relations lues en lot par l'appelant, indexées par identifiant. */
export interface BookingRelations {
  properties: ReadonlyMap<string, PropertyDto>
  residences: ReadonlyMap<string, ResidenceDto>
  /** Propriétaires et comptes clients : tous deux sont des documents `users`. */
  users: ReadonlyMap<string, UserSummaryDto>
  carnet: ReadonlyMap<string, CarnetClientSummary>
}

/**
 * Nature du `client_id` d'une réservation.
 *
 * Une réservation comptoir pointe une fiche du carnet ; une réservation en
 * ligne, le compte de l'application. `source` absent vaut `online` : c'est le
 * seul canal qui existait avant le comptoir.
 */
export function clientKind(booking: Pick<BookingDto, 'source'>): 'account' | 'carnet' {
  return booking.source === 'offline' ? 'carnet' : 'account'
}

/**
 * Identifiants à lire pour nommer les clients d'une liste de réservations.
 *
 * Une réservation portant son instantané client n'a besoin d'aucune lecture :
 * le nom qu'elle affiche est celui figé à la réservation.
 */
export function clientIdsToLoad(bookings: readonly BookingDto[]): {
  accounts: string[]
  carnet: string[]
} {
  const accounts: string[] = []
  const carnet: string[] = []

  for (const booking of bookings) {
    if (booking.client) continue
    if (clientKind(booking) === 'carnet') carnet.push(booking.client_id)
    else accounts.push(booking.client_id)
  }

  return { accounts, carnet }
}

/**
 * Personne ayant réservé, telle que le back-office l'affiche.
 *
 * L'instantané figé à la réservation prime : renommer une fiche du carnet ne
 * réécrit pas l'historique, et la liste des réservations montre donc le nom
 * sous lequel chaque séjour a été pris. À défaut — réservation en ligne,
 * sans instantané —, le compte ou la fiche actuels.
 */
export function resolveBookingClient(
  booking: BookingDto,
  relations: Pick<BookingRelations, 'users' | 'carnet'>
): PlatformBookingClientDto | null {
  const kind = clientKind(booking)

  if (booking.client) {
    const account = kind === 'account' ? relations.users.get(booking.client_id) : undefined
    return {
      id: booking.client_id,
      kind,
      full_name: booking.client.full_name,
      phone: booking.client.phone,
      email: account?.email ?? null,
    }
  }

  if (kind === 'account') {
    const account = relations.users.get(booking.client_id)
    if (!account) return null
    return {
      id: booking.client_id,
      kind,
      full_name: account.full_name,
      phone: account.phone,
      email: account.email,
    }
  }

  const fiche = relations.carnet.get(booking.client_id)
  if (!fiche) return null
  return {
    id: booking.client_id,
    kind,
    full_name: fiche.full_name,
    phone: fiche.phone,
    email: null,
  }
}

/**
 * Joint à chaque réservation son logement, sa résidence, son propriétaire et
 * son client.
 *
 * Une relation introuvable donne `null` sans écarter la ligne : une
 * réservation reste un fait comptable même si le logement a été supprimé
 * depuis.
 */
export function attachBookingRelations(
  bookings: readonly BookingDto[],
  relations: BookingRelations
): PlatformBookingDto[] {
  return bookings.map((booking) => {
    const property = relations.properties.get(booking.property_id)
    const residence = booking.residence_id
      ? relations.residences.get(booking.residence_id)
      : undefined

    // `property` et `client` du DTO de base sont remplacés par leurs versions
    // enrichies ci-dessous, qui les écrasent dans l'objet rendu.
    return {
      ...booking,
      property: property ? toPropertySummary(property) : null,
      residence: residence ? toResidenceSummary(residence) : null,
      owner: relations.users.get(booking.owner_id) ?? null,
      client: resolveBookingClient(booking, relations),
    }
  })
}
