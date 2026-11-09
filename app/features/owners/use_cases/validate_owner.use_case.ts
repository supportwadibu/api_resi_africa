/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'

import type {
  OwnerDto,
  ValidateOwnerInput,
} from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/**
 * Valide un owner en attente :
 *  1. Vérifie qu'il existe et qu'il est bien en statut validable.
 *  2. Bascule owner_status à 'active' + audit (validated_by/validated_at).
 *
 * N'ouvre plus d'essai : le propriétaire choisit lui-même le palier qu'il
 * essaie, depuis l'application. `trial_started` et `trial_end_date` restent
 * dans la réponse, toujours à faux et nul, pour le back-office qui les lit.
 */
export class ValidateOwnerUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(input: ValidateOwnerInput): Promise<{
    owner: OwnerDto
    trial_started: boolean
    trial_end_date: Date | null
  }> {
    const owner = await this.repo.findById(input.owner_id)
    if (!owner) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }
    if (!owner.is_verified) {
      throw new DomainError(
        'owner_not_verified',
        "Le propriétaire n'a pas encore vérifié son OTP.",
        409
      )
    }
    if (owner.owner_status === 'active') {
      throw new DomainError(
        'owner_already_active',
        'Ce propriétaire est déjà validé.',
        409
      )
    }
    if (owner.owner_status === 'rejected') {
      throw new DomainError(
        'owner_rejected',
        'Ce propriétaire a été rejeté. Réactivation manuelle requise.',
        409
      )
    }

    const validated = await this.repo.markValidated(input.owner_id, input.admin_id)
    if (!validated) {
      throw new DomainError('owner_not_found', 'Propriétaire introuvable.', 404)
    }

    return { owner: validated, trial_started: false, trial_end_date: null }
  }
}

export default ValidateOwnerUseCase
