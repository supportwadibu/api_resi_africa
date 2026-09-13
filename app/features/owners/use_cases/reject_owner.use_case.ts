/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  OwnerDto,
  RejectOwnerInput,
} from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/**
 * Rejette un owner en attente : owner_status = 'rejected', rejection_reason audité.
 * Refuse si l'owner est déjà actif (il faut d'abord le désactiver).
 */
export class RejectOwnerUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(input: RejectOwnerInput): Promise<OwnerDto> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new DomainError(
        'rejection_reason_required',
        'Une raison de rejet est requise.',
        422
      )
    }

    const owner = await this.repo.findById(input.owner_id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }
    if (owner.owner_status === 'active') {
      throw new DomainError(
        'owner_already_active',
        "Ce propriétaire est déjà actif. Désactivez-le d'abord.",
        409
      )
    }

    const rejected = await this.repo.markRejected(
      input.owner_id,
      input.admin_id,
      input.reason.trim()
    )
    if (!rejected) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }
    return rejected
  }
}

export default RejectOwnerUseCase
