import { uploadDocument } from '#services/document_storage'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

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
    files: { front?: MultipartFile | null; back?: MultipartFile | null } = {}
  ): Promise<{ client: ClientDto; already_existed: boolean }> {
    // Le numéro identifie le client : plutôt qu'une erreur, on retourne la
    // fiche existante pour que l'application propose de la réutiliser.
    const existing = await this.repo.findByPhone(input.owner_id, input.phone)
    if (existing) {
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
}

export default CreateClientUseCase
