import { COLLECTIONS, collection, toDoc, toPayload } from '#firebase/firestore'

import { MINIMUM_WITHDRAWAL } from '#features/wallets/wallet_rules'

/**
 * Réglages de la plateforme modifiables depuis le backoffice, un document par
 * domaine. Lus à chaque usage : un réglage changé vaut aussitôt, sans
 * redéploiement.
 */
export interface WithdrawalSettingsDocument {
  /** Retrait minimal, en francs. */
  minimum_amount: number
  updated_at: Date
  /** Administrateur qui a fait le dernier changement. */
  updated_by: string | null
}

const WITHDRAWALS_DOC = 'withdrawals'

function settings() {
  return collection<WithdrawalSettingsDocument>(COLLECTIONS.platformSettings)
}

const PlatformSetting = {
  /**
   * Réglages des retraits. Sans document — avant le premier réglage au
   * backoffice —, le minimum historique `MINIMUM_WITHDRAWAL`.
   */
  async withdrawals(): Promise<{ minimum_amount: number; updated_at: Date | null }> {
    const doc = toDoc<WithdrawalSettingsDocument>(await settings().doc(WITHDRAWALS_DOC).get())
    return {
      minimum_amount: doc?.minimum_amount ?? MINIMUM_WITHDRAWAL,
      updated_at: doc?.updated_at ?? null,
    }
  },

  async updateWithdrawals(minimumAmount: number, adminId: string) {
    const now = new Date()
    await settings()
      .doc(WITHDRAWALS_DOC)
      .set(
        toPayload({
          minimum_amount: minimumAmount,
          updated_at: now,
          updated_by: adminId,
        } satisfies WithdrawalSettingsDocument) as unknown as WithdrawalSettingsDocument
      )
    return { minimum_amount: minimumAmount, updated_at: now }
  },
}

export default PlatformSetting
