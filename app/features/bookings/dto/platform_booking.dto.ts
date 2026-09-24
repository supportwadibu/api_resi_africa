import type { PaginationMeta } from '#features/feedbacks/dto/feedback.dto'
import type {
  PropertySummaryDto,
  ResidenceSummaryDto,
} from '#features/properties/dto/platform_property.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'

import type { BookingDto, BookingStatus } from './booking.dto.ts'

/**
 * Personne ayant réservé.
 *
 * Deux origines, selon le canal de la réservation :
 *
 * - `account` — un compte client de l'application : `client_id` désigne un
 *   document `users` (réservation `online`) ;
 * - `carnet` — une fiche du carnet d'un propriétaire, sans compte :
 *   `client_id` désigne un document `clients` (réservation `offline`).
 */
export interface PlatformBookingClientDto {
  id: string
  kind: 'account' | 'carnet'
  full_name: string
  phone: string | null
  email: string | null
}

/** Réservation vue du back-office, ses relations jointes. */
export type PlatformBookingDto = Omit<BookingDto, 'property' | 'client'> & {
  property: PropertySummaryDto | null
  /** Résidence figée sur la réservation à sa création, pas celle d'aujourd'hui. */
  residence: ResidenceSummaryDto | null
  owner: UserSummaryDto | null
  client: PlatformBookingClientDto | null
}

export interface ListPlatformBookingsInput {
  owner_id?: string
  property_id?: string
  client_id?: string
  status?: BookingStatus
  page?: number
  per_page?: number
}

export interface ListPlatformBookingsOutput {
  data: PlatformBookingDto[]
  meta: PaginationMeta
}
