import { clientIdsToLoad, type CarnetClientSummary } from '#features/bookings/platform_booking'
import BookingRepository from '#features/bookings/repositories/booking_repository'
import { toPropertySummary } from '#features/properties/portfolio'
import PropertyRepository from '#features/properties/repositories/property_repository'
import UserRepository from '#features/users/repositories/user_repository'
import { DomainError } from '#utils/domain_error'

import type { PropertySummaryDto } from '#features/properties/dto/platform_property.dto'

import { aggregatePropertyClients, type PropertyClientDto } from '../property_clients.ts'
import ClientRepository from '../repositories/client_repository.ts'

export interface ListPropertyClientsOutput {
  property: PropertySummaryDto
  data: PropertyClientDto[]
  meta: { total: number }
}

/**
 * Clients ayant réservé un logement, pour le back-office.
 *
 * Non paginé : la liste est un agrégat de toutes les réservations du
 * logement, et un agrégat calculé sur une page de réservations compterait
 * faux les séjours de chacun.
 */
export class ListPropertyClientsUseCase {
  constructor(
    private properties: PropertyRepository = new PropertyRepository(),
    private bookings: BookingRepository = new BookingRepository(),
    private users: UserRepository = new UserRepository(),
    private clients: ClientRepository = new ClientRepository()
  ) {}

  async execute(propertyId: string): Promise<ListPropertyClientsOutput> {
    const property = await this.properties.findById(propertyId)
    if (!property) {
      throw new DomainError('property_not_found', 'Logement introuvable.', 404)
    }

    const bookings = await this.bookings.listByProperty(propertyId)
    const ids = clientIdsToLoad(bookings)

    const [users, carnetRecords] = await Promise.all([
      this.users.findSummaries(ids.accounts),
      this.clients.findManyByIdsAcrossOwners(ids.carnet),
    ])

    const carnet = new Map<string, CarnetClientSummary>()
    for (const [id, record] of carnetRecords) {
      carnet.set(id, { id, full_name: record.full_name, phone: record.phone })
    }

    const data = aggregatePropertyClients(bookings, { users, carnet })

    return { property: toPropertySummary(property), data, meta: { total: data.length } }
  }
}

export default ListPropertyClientsUseCase
