/* eslint-disable prettier/prettier */
import { DomainError } from '#utils/domain_error'
import { StartTrialForOwnerUseCase } from '../../subscriptions/use_cases/start_trial_for_owner.use_case.ts'

import type {
  OwnerDto,
  ValidateOwnerInput,
} from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/**
 * Valide un owner en attente :
 *  1. Vérifie qu'il existe et qu'il est bien en statut validable.
 *  2. Bascule owner_status à 'active' + audit (validated_by/validated_at).
 *  3. Garantit qu'un essai gratuit est ouvert.
 *
 * L'essai est normalement déjà ouvert depuis l'inscription : `startTrial` ne
 * fait rien dans ce cas, son use case refusant les doublons. L'appel subsiste
 * comme filet pour les comptes créés avant ce comportement, ou dont l'essai
 * initial a échoué — l'inscription ne bloque pas là-dessus.
 *
 * Si la création du trial échoue, la validation reste effective : elle est
 * l'acte administratif important, le trial peut être créé manuellement.
 */
export class ValidateOwnerUseCase {
  constructor(
    private repo: OwnerRepository = new OwnerRepository(),
    private startTrial: StartTrialForOwnerUseCase = new StartTrialForOwnerUseCase()
  ) {}

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

    try {
      const trial = await this.startTrial.execute({ user_id: input.owner_id })
      return { owner: validated, trial_started: true, trial_end_date: trial.end_date }
    } catch {
      // Cas nominal désormais : l'essai a été ouvert dès l'inscription, le use
      // case refuse d'en créer un second. La validation reste effective.
      return { owner: validated, trial_started: false, trial_end_date: null }
    }
  }
}

export default ValidateOwnerUseCase
