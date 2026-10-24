import type { PaginationMeta } from '#features/feedbacks/dto/feedback.dto'
import type { WalletTransactionType, WithdrawalStatus } from '#models/wallet'

export interface WalletDto {
  id: string
  /** `null` : portefeuille général des biens autonomes. */
  residence_id: string | null
  /** Nom de la résidence, relu à l'affichage ; `null` pour le portefeuille général. */
  residence_name: string | null
  balance: number
  total_credited: number
  total_withdrawn: number
  /** Retraits en attente de versement, déjà débités de `balance`. */
  pending_withdrawals: number
  /** Part de `balance` retirable sans frais : remboursements d'abonnement. */
  fee_free_balance: number
  updated_at: Date
}

export interface WalletTransactionDto {
  id: string
  type: WalletTransactionType
  amount: number
  balance_after: number
  booking_id: string | null
  withdrawal_id: string | null
  created_at: Date
}

export interface WithdrawalDto {
  id: string
  wallet_id: string
  owner_id: string
  residence_id: string | null
  residence_name: string | null
  amount: number
  fee: number
  net_amount: number
  payout_phone: string
  payout_name: string | null
  status: WithdrawalStatus
  payout_reference: string | null
  rejection_reason: string | null
  processed_at: Date | null
  created_at: Date
}

/** Vue de l'équipe : le propriétaire joint, pour savoir à qui verser. */
export interface AdminWithdrawalDto extends WithdrawalDto {
  owner: { id: string; full_name: string; phone: string | null } | null
  processed_by: string | null
}

export interface PaginatedOutput<T> {
  data: T[]
  meta: PaginationMeta
}

export interface RequestWithdrawalInput {
  owner_id: string
  wallet_id: string
  amount: number
  payout_phone: string
  payout_name?: string | null
}

export interface ListWithdrawalsInput {
  owner_id?: string
  status?: WithdrawalStatus
  page?: number
  per_page?: number
}
