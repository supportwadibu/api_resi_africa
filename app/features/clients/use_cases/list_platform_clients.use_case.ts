import BookingRepository from '#features/bookings/repositories/booking_repository'
import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'
import { toPropertySummary } from '#features/properties/portfolio'
import PropertyRepository from '#features/properties/repositories/property_repository'
import UserRepository from '#features/users/repositories/user_repository'

import type { PaginationMeta } from '#features/feedbacks/dto/feedback.dto'
import type { PropertySummaryDto } from '#features/properties/dto/platform_property.dto'

import {
  buildPlatformClients,
  filterPlatformClients,
  type PlatformClientDto,
  type PlatformClientsFilters,
} from '../platform_clients.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Borne de lecture par collection. La liste croise fiches, comptes et
 * réservations, que Firestore ne sait pas joindre : tout est lu, projeté sur
 * quelques champs, puis assemblé en mémoire. Atteinte, la borne est signalée
 * (`truncated`) plutôt que tue.
 */
export const PLATFORM_CLIENTS_READ_LIMIT = 5000

export interface ListPlatformClientsInput extends PlatformClientsFilters {
  page?: number
  per_page?: number
}

export interface ListPlatformClientsOutput {
  data: PlatformClientDto[]
  meta: PaginationMeta
  /** Nombre par nature, avant filtres : les onglets de la liste. */
  counts: { carnet: number; account: number }
  truncated: boolean
}

/** Clients de toute la plateforme, avec leurs propriétaires et logements. */
export class ListPlatformClientsUseCase {
  constructor(
    private clients: ClientRepository = new ClientRepository(),
    private users: UserRepository = new UserRepository(),
    private bookings: BookingRepository = new BookingRepository(),
    private properties: PropertyRepository = new PropertyRepository()
  ) {}

  async execute(input: ListPlatformClientsInput): Promise<ListPlatformClientsOutput> {
    const limit = PLATFORM_CLIENTS_READ_LIMIT
    const [carnet, accounts, bookings] = await Promise.all([
      this.clients.listForAdmin(limit),
      this.users.listByRole('client', limit),
      this.bookings.listForClients(limit),
    ])

    const ownerIds = new Set([...carnet.map((c) => c.owner_id), ...bookings.map((b) => b.owner_id)])
    const [owners, propertyDtos] = await Promise.all([
      this.users.findSummaries([...ownerIds]),
      this.properties.findManyByIds([...new Set(bookings.map((b) => b.property_id))]),
    ])
    const properties = new Map<string, PropertySummaryDto>()
    for (const [id, dto] of propertyDtos) properties.set(id, toPropertySummary(dto))

    const all = buildPlatformClients({ carnet, accounts, bookings, owners, properties })
    const matching = filterPlatformClients(all, input)

    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    return {
      data: matching.slice((page - 1) * perPage, page * perPage),
      meta: buildPaginationMeta(matching.length, input),
      counts: {
        carnet: all.filter((c) => c.kind === 'carnet').length,
        account: all.filter((c) => c.kind === 'account').length,
      },
      truncated: [carnet, accounts, bookings].some((list) => list.length >= limit),
    }
  }
}

export default ListPlatformClientsUseCase
