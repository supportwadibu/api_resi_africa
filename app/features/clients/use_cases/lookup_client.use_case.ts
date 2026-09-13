import type { LookupClientOutput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

/**
 * Dédoublonnage par téléphone, appelé pendant la saisie.
 *
 * Répond toujours 200, y compris quand le client est inconnu : l'absence de
 * fiche est le cas nominal d'un nouveau client, pas une erreur.
 */
export class LookupClientUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(ownerId: string, phone: string): Promise<LookupClientOutput> {
    const found = await this.repo.findByPhone(ownerId, phone)
    return {
      exists: Boolean(found),
      client: found ? ClientRepository.toDto(found) : null,
    }
  }
}

export default LookupClientUseCase
