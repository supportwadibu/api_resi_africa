import Booking from '#models/booking'
import { uploadDocument } from '#services/document_storage'

import type { ActorScope } from '#features/managers/scope'
import type { MultipartFile } from '@adonisjs/core/bodyparser'

import { isClientInScope } from '../client_scope.ts'
import type { ClientDto, CreateClientInput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Enregistre un client au carnet du propriétaire.
 *
 * Les pièces d'identité sont facultatives : au comptoir, un client peut ne pas
 * avoir sa pièce sur lui, et bloquer l'enregistrement bloquerait une entrée
 * d'argent. La fiche porte alors `documents_status: 'pending'`, que
 * l'application signale pour relance.
 */
export class CreateClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(
    input: CreateClientInput,
    files: { front?: MultipartFile | null; back?: MultipartFile | null } = {},
    scope?: ActorScope
  ): Promise<{ client: ClientDto | null; already_existed: boolean }> {
    // Le numéro identifie le client : plutôt qu'une erreur, on retourne la
    // fiche existante pour que l'application propose de la réutiliser.
    const existing = await this.repo.findByPhone(input.owner_id, input.phone)
    if (existing) {
      // Le cadrage sur `owner_id` ne suffit pas au gérant : il couvre *tout* le
      // carnet du propriétaire, si bien qu'un numéro quelconque livrait la
      // fiche complète d'un client hors périmètre — pièce d'identité et
      // statistiques comprises. C'est la porte que `POST /proprio/clients/
      // lookup`, délibérément non exposé au gérant, ferme par ailleurs.
      if (!(await this.isVisibleTo(existing, scope))) {
        // Accusé nu plutôt que 403 : le gérant doit pouvoir constater qu'il n'y
        // a rien à créer, sans rien apprendre de la fiche — pas même par
        // recoupement. Un 403 serait lui-même l'oracle qu'on cherche à fermer,
        // puisqu'il ne se distinguerait qu'en présence d'une fiche.
        return { client: null, already_existed: true }
      }

      return { client: ClientRepository.toDto(existing), already_existed: true }
    }

    const stamp = Date.now()
    const front = files.front
      ? await uploadDocument(files.front, `clients/${input.owner_id}/${stamp}-front`)
      : null
    const back = files.back
      ? await uploadDocument(files.back, `clients/${input.owner_id}/${stamp}-back`)
      : null

    const created = await this.repo.create({
      ...input,
      id_document_front_public_id: front,
      id_document_back_public_id: back,
    })

    return { client: ClientRepository.toDto(created), already_existed: false }
  }

  /**
   * La fiche trouvée relève-t-elle du carnet visible par l'appelant ?
   *
   * Même règle que `GetScopedClientUseCase`, à dessein : le client est visible
   * s'il a séjourné dans le périmètre **ou** si la fiche a été créée par le
   * gérant qui interroge. Deux règles distinctes pour une même notion de
   * visibilité divergeraient au premier correctif appliqué d'un seul côté.
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

export default CreateClientUseCase
