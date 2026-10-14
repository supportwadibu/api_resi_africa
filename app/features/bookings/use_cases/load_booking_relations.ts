import ClientRepository from '#features/clients/repositories/client_repository'
import PropertyRepository from '#features/properties/repositories/property_repository'
import ResidenceRepository from '#features/residences/repositories/residence_repository'
import UserRepository from '#features/users/repositories/user_repository'

import type { BookingDto } from '../dto/booking.dto.ts'
import {
  clientIdsToLoad,
  type BookingRelations,
  type CarnetClientSummary,
} from '../platform_booking.ts'

/** Dépôts lus pour joindre les relations d'une page de réservations. */
export interface BookingRelationsSources {
  properties: PropertyRepository
  residences: ResidenceRepository
  users: UserRepository
  clients: ClientRepository
}

export function defaultBookingRelationsSources(): BookingRelationsSources {
  return {
    properties: new PropertyRepository(),
    residences: new ResidenceRepository(),
    users: new UserRepository(),
    clients: new ClientRepository(),
  }
}

/**
 * Lit en lot tout ce qu'une page de réservations cite.
 *
 * Quatre lectures groupées, lancées ensemble, quel que soit le nombre de
 * lignes. Propriétaires et comptes clients vivent dans la même collection
 * `users` : une seule lecture couvre les deux.
 */
export async function loadBookingRelations(
  bookings: readonly BookingDto[],
  sources: BookingRelationsSources
): Promise<BookingRelations> {
  const clientIds = clientIdsToLoad(bookings)

  const [properties, residences, users, carnetRecords] = await Promise.all([
    sources.properties.findManyByIds(bookings.map((b) => b.property_id)),
    sources.residences.findManyByIds(bookings.map((b) => b.residence_id)),
    sources.users.findSummaries([...bookings.map((b) => b.owner_id), ...clientIds.accounts]),
    sources.clients.findManyByIdsAcrossOwners(clientIds.carnet),
  ])

  const carnet = new Map<string, CarnetClientSummary>()
  for (const [id, record] of carnetRecords) {
    carnet.set(id, { id, full_name: record.full_name, phone: record.phone })
  }

  return { properties, residences, users, carnet }
}
