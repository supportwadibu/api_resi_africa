import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'

/**
 * Profil du gérant connecté.
 *
 * Distinct de `GetManagerUseCase`, qui sert le propriétaire consultant *un* de
 * ses gérants et rend un 404 pour un gérant d'autrui : ici l'appelant *est* le
 * gérant, l'identifiant vient du jeton et non du client, et il n'y a donc rien
 * à deviner.
 *
 * Le périmètre est rendu avec le profil : l'écran d'accueil du mobile s'en sert
 * pour savoir combien de logements sont confiés, sans une requête de plus.
 */
export class GetManagerProfileUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(managerId: string): Promise<ManagerDto> {
    const account = await this.repo.findAccount(managerId)
    if (!account) {
      throw new DomainError('manager_not_found', 'Ce compte est introuvable.', 404)
    }

    const assignment = await this.repo.findAssignment(managerId)

    return toManagerDto(account, assignment)
  }
}

export default GetManagerProfileUseCase
