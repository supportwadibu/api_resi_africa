import { COLLECTIONS, getByIds } from '#firebase/firestore'
import Wallet, {
  type WalletRecord,
  type WalletTransactionRecord,
  type WithdrawalRequestRecord,
  type WithdrawalStatus,
} from '#models/wallet'
import PayoutNumbers from '#models/payout_numbers'
import PlatformSetting from '#models/platform_setting'

import type { ResidenceDocument } from '#models/residence'
import type { UserDocument } from '#models/user'

import type {
  AdminWithdrawalDto,
  WalletDto,
  WalletTransactionDto,
  WithdrawalDto,
  WithdrawalSettingsDto,
} from '../dto/wallet.dto.ts'
import type { PayoutNumber } from '../wallet_rules.ts'

export class WalletRepository {
  static toTransactionDto(doc: WalletTransactionRecord): WalletTransactionDto {
    return {
      id: doc._id,
      type: doc.type,
      amount: doc.amount,
      balance_after: doc.balance_after,
      booking_id: doc.booking_id ?? null,
      withdrawal_id: doc.withdrawal_id ?? null,
      created_at: doc.created_at,
    }
  }

  static toWithdrawalDto(
    doc: WithdrawalRequestRecord,
    residenceName: string | null = null
  ): WithdrawalDto {
    return {
      id: doc._id,
      wallet_id: doc.wallet_id,
      owner_id: doc.owner_id,
      residence_id: doc.residence_id ?? null,
      residence_name: residenceName,
      amount: doc.amount,
      fee: doc.fee,
      net_amount: doc.net_amount,
      payout_phone: doc.payout_phone,
      payout_name: doc.payout_name ?? null,
      payout_slot: doc.payout_slot ?? null,
      status: doc.status,
      payout_reference: doc.payout_reference ?? null,
      rejection_reason: doc.rejection_reason ?? null,
      processed_at: doc.processed_at ?? null,
      created_at: doc.created_at,
    }
  }

  /**
   * Portefeuilles du propriétaire, nom de résidence joint et retraits en
   * attente comptés.
   *
   * Un portefeuille n'existe qu'à partir du premier paiement en ligne : une
   * résidence sans encaissement n'en a pas, et la liste ne l'invente pas.
   */
  async listForOwner(ownerId: string): Promise<WalletDto[]> {
    const [wallets, pending] = await Promise.all([
      Wallet.findByOwner(ownerId),
      Wallet.paginateWithdrawals(
        { owner_id: ownerId, status: 'pending' },
        { limit: 500, offset: 0 }
      ),
    ])
    const names = await this.residenceNames(wallets.map((w) => w.residence_id))

    const pendingByWallet = new Map<string, number>()
    for (const request of pending.data) {
      pendingByWallet.set(
        request.wallet_id,
        (pendingByWallet.get(request.wallet_id) ?? 0) + request.amount
      )
    }

    return wallets
      .map((wallet) => this.toWalletDto(wallet, names, pendingByWallet.get(wallet._id) ?? 0))
      .sort((a, b) => b.balance - a.balance)
  }

  async payoutNumbers(ownerId: string): Promise<PayoutNumber[]> {
    return PayoutNumbers.findByOwner(ownerId)
  }

  async replacePayoutNumbers(ownerId: string, numbers: PayoutNumber[]): Promise<PayoutNumber[]> {
    return PayoutNumbers.replace(ownerId, numbers)
  }

  async withdrawalSettings(): Promise<WithdrawalSettingsDto> {
    return PlatformSetting.withdrawals()
  }

  async updateWithdrawalSettings(
    minimumAmount: number,
    adminId: string
  ): Promise<WithdrawalSettingsDto> {
    return PlatformSetting.updateWithdrawals(minimumAmount, adminId)
  }

  async findForOwner(walletId: string, ownerId: string): Promise<WalletRecord | null> {
    const wallet = await Wallet.findById(walletId)
    return wallet && wallet.owner_id === ownerId ? wallet : null
  }

  async transactions(walletId: string, options: { limit: number; offset: number }) {
    const { data, total } = await Wallet.findTransactions(walletId, options)
    return { data: data.map(WalletRepository.toTransactionDto), total }
  }

  async withdrawals(
    filters: { owner_id?: string; status?: WithdrawalStatus },
    options: { limit: number; offset: number }
  ): Promise<{ data: WithdrawalDto[]; total: number }> {
    const { data, total } = await Wallet.paginateWithdrawals(filters, options)
    const names = await this.residenceNames(data.map((w) => w.residence_id))
    return {
      data: data.map((doc) =>
        WalletRepository.toWithdrawalDto(doc, this.nameOf(names, doc.residence_id))
      ),
      total,
    }
  }

  /** Liste de l'équipe : le propriétaire joint en un aller-retour par lot. */
  async adminWithdrawals(
    filters: { status?: WithdrawalStatus },
    options: { limit: number; offset: number }
  ): Promise<{ data: AdminWithdrawalDto[]; total: number }> {
    const { data, total } = await Wallet.paginateWithdrawals(filters, options)
    return { data: await this.toAdminDtos(data), total }
  }

  async toAdminDtos(docs: WithdrawalRequestRecord[]): Promise<AdminWithdrawalDto[]> {
    const [names, owners] = await Promise.all([
      this.residenceNames(docs.map((d) => d.residence_id)),
      getByIds<UserDocument>(
        COLLECTIONS.users,
        docs.map((d) => d.owner_id)
      ),
    ])

    return docs.map((doc) => {
      const owner = owners.get(doc.owner_id)
      return {
        ...WalletRepository.toWithdrawalDto(doc, this.nameOf(names, doc.residence_id)),
        owner: owner
          ? { id: owner._id, full_name: owner.full_name, phone: owner.phone ?? null }
          : null,
        processed_by: doc.processed_by ?? null,
      }
    })
  }

  private toWalletDto(
    wallet: WalletRecord,
    names: Map<string, { name: string }>,
    pending: number
  ): WalletDto {
    return {
      id: wallet._id,
      residence_id: wallet.residence_id ?? null,
      residence_name: this.nameOf(names, wallet.residence_id),
      balance: wallet.balance,
      total_credited: wallet.total_credited,
      total_withdrawn: wallet.total_withdrawn,
      pending_withdrawals: pending,
      fee_free_balance: wallet.fee_free_balance ?? 0,
      updated_at: wallet.updated_at,
    }
  }

  private residenceNames(ids: (string | null)[]) {
    return getByIds<ResidenceDocument>(COLLECTIONS.residences, ids)
  }

  private nameOf(names: Map<string, { name: string }>, id: string | null): string | null {
    return id ? (names.get(id)?.name ?? null) : null
  }
}

export default WalletRepository
