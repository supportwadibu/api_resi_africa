import Booking from '#models/booking'

import type { ActorScope } from '#features/managers/scope'

import { isClientInScope } from '../client_scope.ts'
import type { LookupClientOutput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Dédoublonnage par téléphone, appelé pendant la saisie.
 *
 * Répond toujours 200, y compris quand le client est inconnu : l'absence de
 * fiche est le cas nominal d'un nouveau client, pas une erreur.
 *
 * La recherche est cadrée sur `owner_id`, ce qui couvre *tout* le carnet du
 * propriétaire. Pour un gérant, ce cadrage ne suffit pas : il livrerait la
 * fiche complète — pièce d'identité et cumuls compris — de n'importe quel
 * client du propriétaire sur simple envoi d'un numéro. C'est exactement
 * « sonder le carnet du propriétaire avec un numéro », que la conception
 * refuse.
 */
export class LookupClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(ownerId: string, phone: string, scope?: ActorScope): Promise<LookupClientOutput> {
    const found = await this.repo.findByPhone(ownerId, phone)

    if (found && !(await this.isVisibleTo(found, scope))) {
      // Réponse d'un client inconnu, et non `exists: true` avec une fiche
      // omise : le drapeau serait lui-même l'oracle que la règle ferme, puisque
      // seule une fiche existante le distinguerait. Contrairement à
      // `POST /gerant/clients` — qui doit accuser qu'il n'y a rien à créer —
      // une recherche n'a aucune action en suspens, et peut donc se taire tout
      // à fait.
      return { exists: false, client: null }
    }

    return {
      exists: Boolean(found),
      client: found ? ClientRepository.toDto(found) : null,
    }
  }

  /**
   * La fiche trouvée relève-t-elle du carnet visible par l'appelant ?
   *
   * Même règle que `GetScopedClientUseCase` et que le dédoublonnage de
   * `CreateClientUseCase`, à dessein : le client est visible s'il a séjourné
   * dans le périmètre **ou** si la fiche a été créée par le gérant qui
   * interroge. Trois définitions de la visibilité d'un client divergeraient au
   * premier correctif appliqué d'un seul côté.
   *
   * Sans périmètre — le propriétaire, ou un appelant antérieur au rôle gérant —
   * le carnet est intact et aucune lecture supplémentaire n'a lieu.
   */
  private async isVisibleTo(
    client: { _id: string; created_by?: string | null },
    scope?: ActorScope
  ): Promise<boolean> {
    if (!scope || scope.propertyIds === null) return true

    const stayed = await Booking.findClientIdsInScope(scope.ownerId, scope.propertyIds)

    return isClientInScope(
      { _id: client._id, created_by: client.created_by ?? null },
      stayed,
      scope
    )
  }
}

export default LookupClientUseCase
