import { COLLECTIONS, getByIds } from '#firebase/firestore'
import PlatformSetting from '#models/platform_setting'
import Sponsorship, {
  type RedemptionStatus,
  type SponsorshipAccountRecord,
  type SponsorshipRecord,
  type SponsorshipRedemptionRecord,
  type SponsorshipStatus,
  type SponsorshipTransactionRecord,
} from '#models/sponsorship'
import User from '#models/user'

import type { UserDocument } from '#models/user'

import type {
  AdminRedemptionDto,
  AdminSponsorshipDto,
  RedemptionDto,
  SponsoredUserDto,
  SponsorshipAccountDto,
  SponsorshipSettingsDto,
  SponsorshipTransactionDto,
  UserSummaryDto,
} from '../dto/sponsorship.dto.ts'
import type { RedemptionType, SponsorshipSettings } from '../sponsorship_rules.ts'

export class SponsorshipRepository {
  static toAccountDto(doc: SponsorshipAccountRecord): SponsorshipAccountDto {
    return {
      code: doc.code,
      balance: doc.balance,
      pending_balance: doc.pending_balance,
      stay_credit: doc.stay_credit,
      total_earned: doc.total_earned,
      total_redeemed: doc.total_redeemed,
    }
  }

  static toSponsoredDto(doc: SponsorshipRecord): SponsoredUserDto {
    return {
      id: doc._id,
      full_name: doc.sponsored_name,
      role: doc.sponsored_role,
      status: doc.status,
      reward_amount: doc.reward_amount,
      available_at: doc.available_at ?? null,
      created_at: doc.created_at,
      qualified_at: doc.qualified_at ?? null,
      earned_at: doc.earned_at ?? null,
    }
  }

  static toTransactionDto(doc: SponsorshipTransactionRecord): SponsorshipTransactionDto {
    return {
      id: doc._id,
      type: doc.type,
      balance_delta: doc.balance_delta,
      stay_credit_delta: doc.stay_credit_delta,
      balance_after: doc.balance_after,
      stay_credit_after: doc.stay_credit_after,
      booking_id: doc.booking_id ?? null,
      redemption_id: doc.redemption_id ?? null,
      created_at: doc.created_at,
    }
  }

  static toRedemptionDto(doc: SponsorshipRedemptionRecord): RedemptionDto {
    return {
      id: doc._id,
      type: doc.type,
      amount: doc.amount,
      status: doc.status,
      payout_phone: doc.payout_phone ?? null,
      payout_name: doc.payout_name ?? null,
      payout_reference: doc.payout_reference ?? null,
      rejection_reason: doc.rejection_reason ?? null,
      processed_at: doc.processed_at ?? null,
      created_at: doc.created_at,
    }
  }

  settings(): Promise<SponsorshipSettingsDto> {
    return PlatformSetting.sponsorships()
  }

  updateSettings(input: SponsorshipSettings, adminId: string): Promise<SponsorshipSettingsDto> {
    return PlatformSetting.updateSponsorships(input, adminId)
  }

  findUser(userId: string) {
    return User.findById(userId)
  }

  async adminSponsorships(
    filters: { status?: SponsorshipStatus; sponsor_id?: string },
    options: { limit: number; offset: number }
  ): Promise<{ data: AdminSponsorshipDto[]; total: number }> {
    const { data, total } = await Sponsorship.paginate(filters, options)
    return { data: await this.toAdminSponsorshipDtos(data), total }
  }

  async toAdminSponsorshipDtos(docs: SponsorshipRecord[]): Promise<AdminSponsorshipDto[]> {
    const users = await this.users(docs.flatMap((d) => [d.sponsor_id, d.sponsored_id]))

    return docs.map((doc) => ({
      id: doc._id,
      code: doc.code,
      status: doc.status,
      sponsor_role: doc.sponsor_role,
      sponsored_role: doc.sponsored_role,
      sponsor: users.get(doc.sponsor_id) ?? null,
      sponsored: {
        ...(users.get(doc.sponsored_id) ?? {
          id: doc.sponsored_id,
          full_name: doc.sponsored_name,
          phone: null,
        }),
        name_at_signup: doc.sponsored_name,
      },
      reward_amount: doc.reward_amount,
      reward_rule: doc.reward_rule ?? null,
      trigger: doc.trigger ?? null,
      trigger_ref_id: doc.trigger_ref_id ?? null,
      trigger_amount: doc.trigger_amount ?? null,
      available_at: doc.available_at ?? null,
      qualified_at: doc.qualified_at ?? null,
      earned_at: doc.earned_at ?? null,
      cancelled_at: doc.cancelled_at ?? null,
      cancellation_reason: doc.cancellation_reason ?? null,
      created_at: doc.created_at,
    }))
  }

  async redemptions(
    filters: { user_id?: string; status?: RedemptionStatus; type?: RedemptionType },
    options: { limit: number; offset: number }
  ): Promise<{ data: RedemptionDto[]; total: number }> {
    const { data, total } = await Sponsorship.paginateRedemptions(filters, options)
    return { data: data.map(SponsorshipRepository.toRedemptionDto), total }
  }

  async adminRedemptions(
    filters: { status?: RedemptionStatus; type?: RedemptionType },
    options: { limit: number; offset: number }
  ): Promise<{ data: AdminRedemptionDto[]; total: number }> {
    const { data, total } = await Sponsorship.paginateRedemptions(filters, options)
    return { data: await this.toAdminRedemptionDtos(data), total }
  }

  async toAdminRedemptionDtos(docs: SponsorshipRedemptionRecord[]): Promise<AdminRedemptionDto[]> {
    const users = await this.users(docs.map((d) => d.user_id))
    return docs.map((doc) => ({
      ...SponsorshipRepository.toRedemptionDto(doc),
      user_role: doc.user_role,
      user: users.get(doc.user_id) ?? null,
      processed_by: doc.processed_by ?? null,
    }))
  }

  async transactions(userId: string, options: { limit: number; offset: number }) {
    const { data, total } = await Sponsorship.findTransactions(userId, options)
    return { data: data.map(SponsorshipRepository.toTransactionDto), total }
  }

  private async users(ids: string[]): Promise<Map<string, UserSummaryDto>> {
    const docs = await getByIds<UserDocument>(COLLECTIONS.users, ids)
    const out = new Map<string, UserSummaryDto>()
    for (const [id, doc] of docs) {
      out.set(id, { id, full_name: doc.full_name, phone: doc.phone ?? null })
    }
    return out
  }
}

export default SponsorshipRepository
