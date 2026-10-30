import type {
  RedemptionStatus,
  SponsorshipStatus,
  SponsorshipTransactionType,
  SponsorshipTrigger,
} from '#models/sponsorship'

import type {
  RedemptionRule,
  RedemptionType,
  RewardRule,
  SponsorshipRole,
  SponsorshipSettings,
} from '../sponsorship_rules.ts'

export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface PaginatedOutput<T> {
  data: T[]
  meta: PaginationMeta
}

export interface SponsorshipAccountDto {
  code: string
  balance: number
  pending_balance: number
  stay_credit: number
  total_earned: number
  total_redeemed: number
}

/** Écran « Parrainage » : tout ce qu'il affiche, en un appel. */
export interface SponsorshipOverviewDto {
  role: SponsorshipRole
  account: SponsorshipAccountDto
  /** Filleuls inscrits, et ceux dont le gain est acquis. */
  sponsored_count: number
  rewarded_count: number
  /** Parrain du compte, s'il en a un. */
  sponsor: { full_name: string } | null
  /** Le compte peut-il encore saisir le code d'un parrain ? */
  can_apply_code: boolean
  program: {
    enabled: boolean
    /** Gain par filleul, selon son rôle. */
    rewards: Record<SponsorshipRole, Pick<RewardRule, 'mode' | 'value' | 'max_amount'>>
    /** Seuil et usages ouverts au rôle du compte. */
    redemption: RedemptionRule
  }
}

export interface SponsoredUserDto {
  id: string
  full_name: string
  role: SponsorshipRole
  status: SponsorshipStatus
  reward_amount: number
  available_at: Date | null
  created_at: Date
  qualified_at: Date | null
  earned_at: Date | null
}

export interface SponsorshipTransactionDto {
  id: string
  type: SponsorshipTransactionType
  balance_delta: number
  stay_credit_delta: number
  balance_after: number
  stay_credit_after: number
  booking_id: string | null
  redemption_id: string | null
  created_at: Date
}

export interface RedemptionDto {
  id: string
  type: RedemptionType
  amount: number
  status: RedemptionStatus
  payout_phone: string | null
  payout_name: string | null
  payout_reference: string | null
  rejection_reason: string | null
  processed_at: Date | null
  created_at: Date
}

export interface UserSummaryDto {
  id: string
  full_name: string
  phone: string | null
}

export interface AdminRedemptionDto extends RedemptionDto {
  user_role: SponsorshipRole
  user: UserSummaryDto | null
  processed_by: string | null
}

export interface AdminSponsorshipDto {
  id: string
  code: string
  status: SponsorshipStatus
  sponsor_role: SponsorshipRole
  sponsored_role: SponsorshipRole
  sponsor: UserSummaryDto | null
  sponsored: UserSummaryDto & { name_at_signup: string }
  reward_amount: number
  reward_rule: RewardRule | null
  trigger: SponsorshipTrigger | null
  trigger_ref_id: string | null
  trigger_amount: number | null
  available_at: Date | null
  qualified_at: Date | null
  earned_at: Date | null
  cancelled_at: Date | null
  cancellation_reason: string | null
  created_at: Date
}

export type SponsorshipSettingsDto = SponsorshipSettings & { updated_at: Date | null }

export interface SponsorshipCodeCheckDto {
  code: string
  /** Prénom du parrain seul : assez pour rassurer, sans exposer le compte. */
  sponsor_first_name: string
}
