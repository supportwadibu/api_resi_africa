import { assertValidCommissionSettings, type CommissionSettings } from '../commission_rules.ts'
import CommissionRepository, {
  type CommissionSettingsDto,
} from '../repositories/commission_repository.ts'

export class GetCommissionSettingsUseCase {
  constructor(private repo: CommissionRepository = new CommissionRepository()) {}

  execute(): Promise<CommissionSettingsDto> {
    return this.repo.settings()
  }
}

/**
 * Remplace le réglage. Vaut aussitôt pour les prix affichés et les nouvelles
 * réservations ; celles déjà prises gardent la règle figée à leur création.
 */
export class UpdateCommissionSettingsUseCase {
  constructor(private repo: CommissionRepository = new CommissionRepository()) {}

  execute(input: CommissionSettings, adminId: string): Promise<CommissionSettingsDto> {
    assertValidCommissionSettings(input)
    return this.repo.updateSettings(input, adminId)
  }
}
