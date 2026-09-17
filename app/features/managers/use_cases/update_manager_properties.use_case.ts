import { normalizePropertyIds } from '#models/manager_assignment'
import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'
import { assertPropertiesOwned } from './create_manager.use_case.ts'
import { loadOwnedAssignment } from './get_manager.use_case.ts'

/**
 * Remplace le périmètre d'un gérant.
 *
 * Remplacement et non fusion — `PUT`, pas `PATCH` : le propriétaire envoie la
 * liste complète des logements qu'il veut affecter, si bien qu'un ajout et un
 * retrait faits dans le même geste deviennent une seule écriture et que l'état
 * obtenu ne dépend pas de l'ordre des requêtes.
 */
export class UpdateManagerPropertiesUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(managerId: string, ownerId: string, propertyIds: string[]): Promise<ManagerDto> {
    await loadOwnedAssignment(this.repo, managerId, ownerId)

    const normalized = normalizePropertyIds(propertyIds)

    // Même garde qu'à la création : un identifiant deviné ne doit pas permettre
    // de s'affecter le logement d'autrui.
    const owned = await this.repo.listOwnedProperties(ownerId)
    assertPropertiesOwned(owned, normalized, ownerId)

    const updated = await this.repo.replaceAssignmentProperties(managerId, normalized)
    const account = await this.repo.findAccount(managerId)

    if (!updated || !account) {
      throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
    }

    return toManagerDto(account, updated)
  }
}

export default UpdateManagerPropertiesUseCase
