import { assertValidDepositSettings, type DepositSettings } from '../deposit_rules.ts'
import DepositRepository, { type DepositSettingsDto } from '../repositories/deposit_repository.ts'

export class GetDepositSettingsUseCase {
  constructor(private repo: DepositRepository = new DepositRepository()) {}

  execute(): Promise<DepositSettingsDto> {
    return this.repo.settings()
  }
}

/**
 * Remplace le réglage. Vaut aussitôt pour les nouvelles réservations ; celles
 * déjà prises gardent l'acompte figé à leur création.
 */
export class UpdateDepositSettingsUseCase {
  constructor(private repo: DepositRepository = new DepositRepository()) {}

  execute(input: DepositSettings, adminId: string): Promise<DepositSettingsDto> {
    assertValidDepositSettings(input)
    return this.repo.updateSettings(input, adminId)
  }
}
