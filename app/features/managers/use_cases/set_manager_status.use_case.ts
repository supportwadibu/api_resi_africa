import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'
import { loadOwnedAssignment } from './get_manager.use_case.ts'

/**
 * Suspend ou réactive un gérant.
 *
 * La bascule porte sur l'affectation, pas sur le compte : elle coupe l'accès
 * — `resolveActorScope` refuse une affectation inactive — sans supprimer
 * l'historique ni empêcher le gérant de se connecter pour changer son mot de
 * passe. Désactiver le compte relèverait d'une autre décision.
 */
export class SetManagerStatusUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(managerId: string, ownerId: string, isActive: boolean): Promise<ManagerDto> {
    await loadOwnedAssignment(this.repo, managerId, ownerId)

    const updated = await this.repo.setAssignmentActive(managerId, isActive)
    const account = await this.repo.findAccount(managerId)

    if (!updated || !account) {
      throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
    }

    return toManagerDto(account, updated)
  }
}

export default SetManagerStatusUseCase
