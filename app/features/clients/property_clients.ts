import {
  clientKind,
  resolveBookingClient,
  type BookingRelations,
} from '#features/bookings/platform_booking'

import type { BookingDto, BookingStatus } from '#features/bookings/dto/booking.dto'

import type { ClientStatsDto } from './dto/client.dto.ts'
import { computeClientStats } from './use_cases/compute_client_stats.use_case.ts'

/**
 * Personne ayant réservé un logement, avec ce qu'elle y a fait.
 *
 * Les clients ne sont rattachés à aucun logement : le carnet l'est au
 * propriétaire, les comptes à personne. Seules les réservations disent qui a
 * séjourné où — la liste en est donc dérivée.
 */
export interface PropertyClientDto {
  client_id: string
  kind: 'account' | 'carnet'
  /** `null` quand ni instantané, ni compte, ni fiche ne permet de le nommer. */
  full_name: string | null
  phone: string | null
  email: string | null
  /** Séjours comptés, annulations exclues — même règle que le carnet. */
  stats: ClientStatsDto
  /** Toutes les réservations sur ce logement, annulées comprises. */
  bookings_count: number
  last_booking: {
    id: string
    status: BookingStatus
    start_date: Date
    end_date: Date
  }
}

/**
 * Regroupe les réservations d'un logement par client.
 *
 * Les réservations sont supposées triées de la plus récente à la plus
 * ancienne, ordre de lecture du dépôt : la première rencontrée pour un client
 * est donc sa dernière réservation, et c'est son instantané qui le nomme.
 *
 * Le regroupement se fait sur `client_id` **et** sur la nature du client : un
 * compte et une fiche du carnet vivent dans deux collections distinctes, et
 * rien n'interdit qu'ils portent le même identifiant.
 */
export function aggregatePropertyClients(
  bookings: readonly BookingDto[],
  relations: Pick<BookingRelations, 'users' | 'carnet'>
): PropertyClientDto[] {
  const groups = new Map<string, BookingDto[]>()

  for (const booking of bookings) {
    const key = `${clientKind(booking)}:${booking.client_id}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(booking)
    else groups.set(key, [booking])
  }

  const clients: PropertyClientDto[] = []

  for (const group of groups.values()) {
    const latest = group[0]
    // Instantané de la réservation la plus récente d'abord ; une réservation
    // plus ancienne peut en porter un quand la dernière n'en a pas.
    const named = group.find((b) => b.client) ?? latest
    const identity = resolveBookingClient(named, relations)

    clients.push({
      client_id: latest.client_id,
      kind: clientKind(latest),
      full_name: identity?.full_name ?? null,
      phone: identity?.phone ?? null,
      email: identity?.email ?? null,
      stats: computeClientStats(group),
      bookings_count: group.length,
      last_booking: {
        id: latest.id,
        status: latest.status,
        start_date: latest.start_date,
        end_date: latest.end_date,
      },
    })
  }

  // Dernier séjour d'abord ; un client n'ayant que des annulations n'a pas de
  // séjour et passe après ceux qui en ont.
  return clients.sort((a, b) => {
    const left = a.stats.last_stay_at?.getTime() ?? -Infinity
    const right = b.stats.last_stay_at?.getTime() ?? -Infinity
    return right - left
  })
}
