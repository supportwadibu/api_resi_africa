import PlatformSetting from '#models/platform_setting'

import type { DepositSettings } from '../deposit_rules.ts'

export type DepositSettingsDto = DepositSettings & { updated_at: Date | null }

export class DepositRepository {
  settings(): Promise<DepositSettingsDto> {
    return PlatformSetting.deposits()
  }

  updateSettings(input: DepositSettings, adminId: string): Promise<DepositSettingsDto> {
    return PlatformSetting.updateDeposits(input, adminId)
  }
}

export default DepositRepository
