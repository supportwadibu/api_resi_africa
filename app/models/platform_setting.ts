import { COLLECTIONS, collection, toDoc, toPayload } from '#firebase/firestore'

import {
  resolveSponsorshipSettings,
  type SponsorshipSettings,
} from '#features/sponsorships/sponsorship_rules'
import {
  resolveCommissionSettings,
  type CommissionSettings,
} from '#features/commissions/commission_rules'
import { MINIMUM_WITHDRAWAL } from '#features/wallets/wallet_rules'
import { resolveDepositSettings, type DepositSettings } from '#features/deposits/deposit_rules'

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

/** Réglages du parrainage : voir `sponsorship_rules.ts`. */
export interface SponsorshipSettingsDocument extends SponsorshipSettings {
  updated_at: Date
  updated_by: string | null
}

const WITHDRAWALS_DOC = 'withdrawals'
const SPONSORSHIPS_DOC = 'sponsorships'
const COMMISSIONS_DOC = 'commissions'
const DEPOSITS_DOC = 'deposits'

/** Réglage de l'acompte : voir `deposit_rules.ts`. */
export interface DepositSettingsDocument extends DepositSettings {
  updated_at: Date
  updated_by: string | null
}

function depositSettings() {
  return collection<DepositSettingsDocument>(COLLECTIONS.platformSettings).doc(DEPOSITS_DOC)
}

/** Réglage de la commission de RESI : voir `commission_rules.ts`. */
export interface CommissionSettingsDocument extends CommissionSettings {
  updated_at: Date
  updated_by: string | null
}

function commissionSettings() {
  return collection<CommissionSettingsDocument>(COLLECTIONS.platformSettings).doc(COMMISSIONS_DOC)
}

function settings() {
  return collection<WithdrawalSettingsDocument>(COLLECTIONS.platformSettings)
}

function sponsorshipSettings() {
  return collection<SponsorshipSettingsDocument>(COLLECTIONS.platformSettings).doc(SPONSORSHIPS_DOC)
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

  /**
   * Réglages du parrainage. Sans document — avant le premier réglage au
   * backoffice —, `DEFAULT_SPONSORSHIP_SETTINGS`, gains coupés.
   */
  async sponsorships(): Promise<SponsorshipSettings & { updated_at: Date | null }> {
    const doc = toDoc<SponsorshipSettingsDocument>(await sponsorshipSettings().get())
    return { ...resolveSponsorshipSettings(doc), updated_at: doc?.updated_at ?? null }
  },

  async updateSponsorships(input: SponsorshipSettings, adminId: string) {
    const now = new Date()
    await sponsorshipSettings().set(
      toPayload({
        ...input,
        updated_at: now,
        updated_by: adminId,
      } satisfies SponsorshipSettingsDocument) as unknown as SponsorshipSettingsDocument
    )
    return { ...resolveSponsorshipSettings(input), updated_at: now }
  },

  /**
   * Commission de RESI. Sans document — avant le premier réglage au
   * backoffice —, `DEFAULT_COMMISSION_SETTINGS`, commission coupée.
   */
  async commissions(): Promise<CommissionSettings & { updated_at: Date | null }> {
    const doc = toDoc<CommissionSettingsDocument>(await commissionSettings().get())
    return { ...resolveCommissionSettings(doc), updated_at: doc?.updated_at ?? null }
  },

  async updateCommissions(input: CommissionSettings, adminId: string) {
    const now = new Date()
    const resolved = resolveCommissionSettings(input)
    await commissionSettings().set(
      toPayload({
        ...resolved,
        updated_at: now,
        updated_by: adminId,
      } satisfies CommissionSettingsDocument) as unknown as CommissionSettingsDocument
    )
    return { ...resolved, updated_at: now }
  },

  /**
   * Acompte des réservations en ligne. Sans document — avant le premier
   * réglage au backoffice —, `DEFAULT_DEPOSIT_SETTINGS`, acompte coupé.
   */
  async deposits(): Promise<DepositSettings & { updated_at: Date | null }> {
    const doc = toDoc<DepositSettingsDocument>(await depositSettings().get())
    return { ...resolveDepositSettings(doc), updated_at: doc?.updated_at ?? null }
  },

  async updateDeposits(input: DepositSettings, adminId: string) {
    const now = new Date()
    const resolved = resolveDepositSettings(input)
    await depositSettings().set(
      toPayload({
        ...resolved,
        updated_at: now,
        updated_by: adminId,
      } satisfies DepositSettingsDocument) as unknown as DepositSettingsDocument
    )
    return { ...resolved, updated_at: now }
  },
}

export default PlatformSetting
