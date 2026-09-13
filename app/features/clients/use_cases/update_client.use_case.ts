import { uploadDocument } from '#services/document_storage'
import { DomainError } from '#utils/domain_error'

import type { MultipartFile } from '@adonisjs/core/bodyparser'

import type { ClientDto, UpdateClientInput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

export class UpdateClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(
    id: string,
    ownerId: string,
    input: UpdateClientInput,
    files: { front?: MultipartFile | null; back?: MultipartFile | null } = {}
  ): Promise<ClientDto> {
    // Changer un numéro pour celui d'une autre fiche fusionnerait deux clients
    // distincts sans que rien ne le signale.
    if (input.phone) {
      const clash = await this.repo.findByPhone(ownerId, input.phone)
      if (clash && clash._id !== id) {
        throw new DomainError(
          'client_phone_taken',
          'Un autre client du carnet porte déjà ce numéro.',
          422
        )
      }
    }

    const stamp = Date.now()
    const front = files.front
      ? await uploadDocument(files.front, `clients/${ownerId}/${stamp}-front`)
      : undefined
    const back = files.back
      ? await uploadDocument(files.back, `clients/${ownerId}/${stamp}-back`)
      : undefined

    const updated = await this.repo.update(id, ownerId, {
      ...input,
      ...(front !== undefined ? { id_document_front_public_id: front } : {}),
      ...(back !== undefined ? { id_document_back_public_id: back } : {}),
    })

    if (!updated) {
      throw new DomainError('client_not_found', 'Client introuvable.', 404)
    }

    return ClientRepository.toDto(updated)
  }
}

export default UpdateClientUseCase
