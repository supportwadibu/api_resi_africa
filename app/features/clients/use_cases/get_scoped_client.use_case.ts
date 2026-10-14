import Booking from '#models/booking'
import { DomainError } from '#utils/domain_error'

import type { ActorScope } from '#features/managers/scope'

import { retainClientsInScope } from '../client_scope.ts'
import type { ClientDto } from '../dto/client.dto.ts'
import GetClientUseCase from './get_client.use_case.ts'

/**
 * Fiche client, restreinte au carnet visible par l'appelant.
 *
 * La règle est celle de la liste, appliquée à une fiche nommément désignée : le
 * client est visible s'il a séjourné dans le périmètre **ou** si la fiche a été
 * créée par le gérant qui interroge. Sans cette garde, un identifiant deviné
 * livrerait — et laisserait modifier — n'importe quelle fiche du propriétaire,
 * alors même que la liste, elle, est cloisonnée.
 *
 * Les statistiques rendues sont celles du périmètre : un total de séjours
 * calculé sur tout le parc apprendrait au gérant combien le client a séjourné
 * dans les logements qui ne lui sont pas confiés.
 */
export class GetScopedClientUseCase {
  constructor(private inner: GetClientUseCase = new GetClientUseCase()) {}

  async execute(id: string, scope: ActorScope): Promise<ClientDto> {
    const client = await this.inner.execute(id, scope.ownerId, scope.propertyIds)

    // Le propriétaire voit son carnet entier : aucune lecture supplémentaire,
    // le chemin reste celui d'avant le rôle gérant.
    if (scope.propertyIds === null) return client

    const stayed = await Booking.findClientIdsInScope(scope.ownerId, scope.propertyIds)
    const visible = retainClientsInScope(
      [{ _id: client.id, created_by: client.created_by ?? null }],
      stayed,
      scope
    )

    if (visible.length === 0) {
      // 403 et non 404 : un 404 laisserait deviner par tâtonnement quelles
      // fiches existent chez le propriétaire.
      throw new DomainError('out_of_scope', 'Ce client ne fait pas partie de votre périmètre.', 403)
    }

    return client
  }
}

export default GetScopedClientUseCase
