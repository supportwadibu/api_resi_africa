import Booking from '#models/booking'

import { retainClientsInScope } from '../client_scope.ts'

import type { ListClientsInput, ListClientsOutput } from '../dto/client.dto.ts'
import type { ActorScope } from '#features/managers/scope'
import ClientRepository from '../repositories/client_repository.ts'

export class ListClientsUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  /**
   * `scope` cloisonne le carnet quand l'appelant est un gérant. Absent — le
   * propriétaire —, le chemin reste strictement celui d'avant le rôle gérant :
   * aucune lecture supplémentaire, aucune régression possible.
   */
  async execute(input: ListClientsInput, scope?: ActorScope): Promise<ListClientsOutput> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    if (scope && scope.propertyIds !== null) {
      return this.executeScoped(input, scope, page, perPage)
    }

    const { data, total } = await this.repo.paginate(input)

    return {
      data: data.map(ClientRepository.toDto),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }

  /**
   * Carnet d'un gérant : les fiches sont retenues **avant** la découpe en
   * pages.
   *
   * Paginer puis filtrer rendrait des pages trouées et un `total` portant sur
   * le carnet entier — le gérant apprendrait par ce seul nombre combien de
   * clients le propriétaire possède ailleurs.
   *
   * Firestore ne sachant pas exprimer « client ayant séjourné dans l'un de ces
   * logements », la restriction est appliquée en mémoire sur une lecture
   * bornée, exactement comme la recherche par terme du carnet.
   */
  private async executeScoped(
    input: ListClientsInput,
    scope: ActorScope,
    page: number,
    perPage: number
  ): Promise<ListClientsOutput> {
    const [data, stayedInScope] = await Promise.all([
      this.repo.listAll(input),
      Booking.findClientIdsInScope(scope.ownerId, scope.propertyIds),
    ])

    const visible = retainClientsInScope(data, stayedInScope, scope)

    return {
      data: visible.slice((page - 1) * perPage, page * perPage).map(ClientRepository.toDto),
      meta: {
        total: visible.length,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(visible.length / perPage)),
      },
    }
  }
}

export default ListClientsUseCase
