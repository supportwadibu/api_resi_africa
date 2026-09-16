import { isWithinScope } from '#features/managers/scope'

import type { ActorScope } from '#features/managers/scope'

/** Réservation réduite à ce que le cloisonnement du carnet en lit. */
export interface ClientScopeBooking {
  client_id: string
  property_id?: string | null
}

/** Fiche réduite à ce que le cloisonnement du carnet en lit. */
export interface ScopedClient {
  _id: string
  created_by?: string | null
}

/** Clients ayant séjourné dans un logement du périmètre. */
export function clientIdsWithStayInScope(
  bookings: readonly ClientScopeBooking[],
  scope: ActorScope
): Set<string> {
  return new Set(
    bookings
      .filter((booking) => isWithinScope(scope, booking.property_id ?? null))
      .map((booking) => booking.client_id)
  )
}

/**
 * Restreint le carnet au périmètre de l'appelant.
 *
 * Les clients sont cloisonnés par `owner_id` et **non par logement** : servir
 * le carnet entier donnerait à un gérant toute la clientèle du propriétaire, y
 * compris celle d'autres résidences et d'autres gérants.
 *
 * Deux branches, et la seconde est indispensable :
 *
 * 1. le client a séjourné dans un logement du périmètre ;
 * 2. la fiche a été créée par le gérant qui interroge.
 *
 * Sans la seconde, une fiche saisie au comptoir — qui n'a, l'espace d'un
 * instant, aucune réservation — disparaîtrait entre sa création et la
 * réservation qu'elle sert.
 *
 * `propertyIds: null` — le propriétaire — rend le carnet intact.
 */
export function filterClientsForScope<T extends ScopedClient>(
  clients: readonly T[],
  bookings: readonly ClientScopeBooking[],
  scope: ActorScope
): T[] {
  if (scope.propertyIds === null) return [...clients]

  return retainClientsInScope(clients, clientIdsWithStayInScope(bookings, scope), scope)
}

/**
 * Même règle que `filterClientsForScope`, à partir d'un ensemble d'identifiants
 * déjà constitué.
 *
 * Employée par la lecture réelle, où les séjours du périmètre sont lus une
 * seule fois et réduits à leurs identifiants de client — rapatrier les
 * réservations entières pour ne garder qu'un champ serait du gaspillage.
 */
export function retainClientsInScope<T extends ScopedClient>(
  clients: readonly T[],
  stayedInScope: ReadonlySet<string>,
  scope: ActorScope
): T[] {
  if (scope.propertyIds === null) return [...clients]

  return clients.filter(
    (client) => stayedInScope.has(client._id) || client.created_by === scope.actorId
  )
}

export default filterClientsForScope
