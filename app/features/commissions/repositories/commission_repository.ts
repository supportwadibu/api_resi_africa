import PlatformSetting from '#models/platform_setting'

import type { CommissionSettings } from '../commission_rules.ts'

export type CommissionSettingsDto = CommissionSettings & { updated_at: Date | null }

export class CommissionRepository {
  settings(): Promise<CommissionSettingsDto> {
    return PlatformSetting.commissions()
  }

  updateSettings(input: CommissionSettings, adminId: string): Promise<CommissionSettingsDto> {
    return PlatformSetting.updateCommissions(input, adminId)
  }
}

export default CommissionRepository
