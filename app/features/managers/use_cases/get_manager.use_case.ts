import { DomainError } from '#utils/domain_error'

import { toManagerDto, type ManagerDto } from '../dto/manager.dto.ts'
import ManagerRepository from '../repositories/manager_repository.ts'

import type { ManagerAssignmentRecord } from '#models/manager_assignment'

/**
 * Charge l'affectation d'un gérant en vérifiant qu'elle relève bien de ce
 * propriétaire.
 *
 * L'affectation, et non le compte, porte le lien au propriétaire : c'est elle
 * qui décide. Un gérant d'autrui est traité comme introuvable — 404 et non 403,
 * car ici l'appelant ne doit même pas apprendre que le compte existe.
 */
export async function loadOwnedAssignment(
  repo: ManagerRepository,
  managerId: string,
  ownerId: string
): Promise<ManagerAssignmentRecord> {
  const assignment = await repo.findAssignment(managerId)

  if (!assignment || assignment.owner_id !== ownerId) {
    throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
  }

  return assignment
}

/** Détail d'un gérant et de son périmètre. */
export class GetManagerUseCase {
  constructor(private repo: ManagerRepository = new ManagerRepository()) {}

  async execute(managerId: string, ownerId: string): Promise<ManagerDto> {
    const assignment = await loadOwnedAssignment(this.repo, managerId, ownerId)
    const account = await this.repo.findAccount(managerId)

    if (!account) {
      throw new DomainError('manager_not_found', 'Ce gérant est introuvable.', 404)
    }

    return toManagerDto(account, assignment)
  }
}

export default GetManagerUseCase
