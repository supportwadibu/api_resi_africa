import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  transaction,
  type WithId,
} from '#firebase/firestore'

/**
 * Portefeuille d'une résidence : l'argent payé en ligne par ses clients, que
 * RESI doit au propriétaire.
 *
 * Trois collections :
 * - `wallets` — le solde, un document par résidence (ou par propriétaire pour
 *   ses biens autonomes), identifiant dérivé (`walletIdFor`) ;
 * - `wallet_transactions` — le journal de chaque mouvement, qui justifie le
 *   solde ;
 * - `withdrawal_requests` — les demandes de retrait, traitées par l'équipe.
 *
 * Le solde n'est jamais recalculé depuis le journal : chaque mouvement
 * l'ajuste dans la même transaction que l'écriture de sa ligne, si bien que
 * les deux ne peuvent pas diverger.
 */

export interface WalletDocument {
  owner_id: string
  /** `null` : portefeuille général des biens autonomes du propriétaire. */
  residence_id: string | null
  /** Disponible au retrait. Les retraits en attente en sont déjà débités. */
  balance: number
  total_credited: number
  /** Retraits versés, montants bruts (frais compris). */
  total_withdrawn: number
  created_at: Date
  updated_at: Date
}

export type WalletRecord = WithId<WalletDocument>

export const WALLET_TRANSACTION_TYPES = ['credit', 'withdrawal', 'withdrawal_reversal'] as const
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number]

export interface WalletTransactionDocument {
  wallet_id: string
  owner_id: string
  residence_id: string | null
  type: WalletTransactionType
  /** Signé : positif au crédit, négatif au débit. */
  amount: number
  /** Solde après le mouvement. */
  balance_after: number
  booking_id: string | null
  booking_payment_id: string | null
  withdrawal_id: string | null
  created_at: Date
}

export type WalletTransactionRecord = WithId<WalletTransactionDocument>

export const WITHDRAWAL_STATUSES = ['pending', 'paid', 'rejected'] as const
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number]

export interface WithdrawalRequestDocument {
  wallet_id: string
  owner_id: string
  residence_id: string | null
  /** Débité du portefeuille. */
  amount: number
  fee: number
  /** Versé au propriétaire. */
  net_amount: number
  /** Numéro Wave du versement, figé à la demande. */
  payout_phone: string
  /** Nom du titulaire, figé à la demande, pour que l'équipe vérifie le compte. */
  payout_name: string | null
  status: WithdrawalStatus
  /** Référence du transfert Wave saisie par l'équipe. */
  payout_reference: string | null
  rejection_reason: string | null
  processed_at: Date | null
  processed_by: string | null
  created_at: Date
  updated_at: Date
}

export type WithdrawalRequestRecord = WithId<WithdrawalRequestDocument>

function wallets() {
  return collection<WalletDocument>(COLLECTIONS.wallets)
}

function walletTransactions() {
  return collection<WalletTransactionDocument>(COLLECTIONS.walletTransactions)
}

function withdrawals() {
  return collection<WithdrawalRequestDocument>(COLLECTIONS.withdrawalRequests)
}

function emptyWallet(ownerId: string, residenceId: string | null, now: Date): WalletDocument {
  return {
    owner_id: ownerId,
    residence_id: residenceId,
    balance: 0,
    total_credited: 0,
    total_withdrawn: 0,
    created_at: now,
    updated_at: now,
  }
}

const Wallet = {
  async findById(id: string): Promise<WalletRecord | null> {
    if (!id) return null
    return toDoc<WalletDocument>(await wallets().doc(id).get())
  },

  async findByOwner(ownerId: string): Promise<WalletRecord[]> {
    const snapshot = await wallets().where('owner_id', '==', ownerId).get()
    return toDocs<WalletDocument>(snapshot.docs)
  },

  /**
   * Crédite le portefeuille d'un paiement Wave réussi.
   *
   * Idempotent : la ligne du journal porte l'identifiant du paiement. Le
   * webhook et la page de retour constatent le même paiement à quelques
   * secondes d'écart — le second trouve la ligne et ne crédite rien.
   *
   * Rend `false` si le paiement était déjà crédité.
   */
  async creditPayment(input: {
    wallet_id: string
    owner_id: string
    residence_id: string | null
    booking_id: string
    booking_payment_id: string
    amount: number
  }): Promise<boolean> {
    const walletRef = wallets().doc(input.wallet_id)
    const lineRef = walletTransactions().doc(`payment_${input.booking_payment_id}`)

    return transaction(async (tx) => {
      const [walletSnap, lineSnap] = await Promise.all([tx.get(walletRef), tx.get(lineRef)])
      if (lineSnap.exists) return false

      const now = new Date()
      const current =
        toDoc<WalletDocument>(walletSnap) ?? emptyWallet(input.owner_id, input.residence_id, now)
      const balance = current.balance + input.amount

      tx.set(
        walletRef,
        toPayload({
          owner_id: current.owner_id,
          residence_id: current.residence_id,
          balance,
          total_credited: current.total_credited + input.amount,
          total_withdrawn: current.total_withdrawn,
          created_at: current.created_at,
          updated_at: now,
        }) as unknown as WalletDocument
      )
      tx.set(
        lineRef,
        toPayload({
          wallet_id: input.wallet_id,
          owner_id: input.owner_id,
          residence_id: input.residence_id,
          type: 'credit',
          amount: input.amount,
          balance_after: balance,
          booking_id: input.booking_id,
          booking_payment_id: input.booking_payment_id,
          withdrawal_id: null,
          created_at: now,
        } satisfies WalletTransactionDocument) as unknown as WalletTransactionDocument
      )
      return true
    })
  },

  /**
   * Enregistre une demande de retrait et en débite le portefeuille.
   *
   * Débité à la demande et non au versement : sinon deux demandes successives
   * pourraient chacune passer sur le même solde. `quote` reçoit le solde lu
   * dans la transaction et lève si le retrait n'est pas possible.
   */
  async requestWithdrawal(input: {
    wallet_id: string
    owner_id: string
    payout_phone: string
    payout_name: string | null
    quote: (balance: number) => { amount: number; fee: number; net_amount: number }
  }): Promise<WithdrawalRequestRecord | null> {
    const walletRef = wallets().doc(input.wallet_id)
    const requestRef = withdrawals().doc()
    const lineRef = walletTransactions().doc(`withdrawal_${requestRef.id}`)

    return transaction(async (tx) => {
      const wallet = toDoc<WalletDocument>(await tx.get(walletRef))
      if (!wallet || wallet.owner_id !== input.owner_id) return null

      const quoted = input.quote(wallet.balance)
      const amount = quoted.amount
      const now = new Date()
      const balance = wallet.balance - amount

      const request: WithdrawalRequestDocument = {
        wallet_id: input.wallet_id,
        owner_id: input.owner_id,
        residence_id: wallet.residence_id,
        amount,
        fee: quoted.fee,
        net_amount: quoted.net_amount,
        payout_phone: input.payout_phone,
        payout_name: input.payout_name,
        status: 'pending',
        payout_reference: null,
        rejection_reason: null,
        processed_at: null,
        processed_by: null,
        created_at: now,
        updated_at: now,
      }

      tx.update(walletRef, { balance, updated_at: now })
      tx.set(requestRef, toPayload(request) as unknown as WithdrawalRequestDocument)
      tx.set(
        lineRef,
        toPayload({
          wallet_id: input.wallet_id,
          owner_id: input.owner_id,
          residence_id: wallet.residence_id,
          type: 'withdrawal',
          amount: -amount,
          balance_after: balance,
          booking_id: null,
          booking_payment_id: null,
          withdrawal_id: requestRef.id,
          created_at: now,
        } satisfies WalletTransactionDocument) as unknown as WalletTransactionDocument
      )

      return { ...request, _id: requestRef.id }
    })
  },

  /**
   * Clôt une demande en attente : versée, ou refusée et recréditée.
   *
   * `null` si la demande n'existe pas ; `false` comme statut rendu si elle
   * n'était plus en attente — l'appelant en fait un conflit. Un refus remet le
   * montant au portefeuille : il n'a jamais quitté RESI.
   */
  async resolveWithdrawal(
    id: string,
    input: {
      status: 'paid' | 'rejected'
      processed_by: string
      payout_reference?: string | null
      rejection_reason?: string | null
    }
  ): Promise<{ request: WithdrawalRequestRecord; changed: boolean } | null> {
    const requestRef = withdrawals().doc(id)

    return transaction(async (tx) => {
      const request = toDoc<WithdrawalRequestDocument>(await tx.get(requestRef))
      if (!request) return null
      if (request.status !== 'pending') return { request, changed: false }

      const walletRef = wallets().doc(request.wallet_id)
      const wallet = toDoc<WalletDocument>(await tx.get(walletRef))
      const now = new Date()

      const patch = {
        status: input.status,
        payout_reference: input.status === 'paid' ? (input.payout_reference ?? null) : null,
        rejection_reason: input.status === 'rejected' ? (input.rejection_reason ?? null) : null,
        processed_at: now,
        processed_by: input.processed_by,
        updated_at: now,
      }
      tx.update(requestRef, patch)

      if (wallet && input.status === 'paid') {
        tx.update(walletRef, {
          total_withdrawn: wallet.total_withdrawn + request.amount,
          updated_at: now,
        })
      }

      if (wallet && input.status === 'rejected') {
        const balance = wallet.balance + request.amount
        tx.update(walletRef, { balance, updated_at: now })
        tx.set(
          walletTransactions().doc(`reversal_${id}`),
          toPayload({
            wallet_id: request.wallet_id,
            owner_id: request.owner_id,
            residence_id: request.residence_id,
            type: 'withdrawal_reversal',
            amount: request.amount,
            balance_after: balance,
            booking_id: null,
            booking_payment_id: null,
            withdrawal_id: id,
            created_at: now,
          } satisfies WalletTransactionDocument) as unknown as WalletTransactionDocument
        )
      }

      return { request: { ...request, ...patch }, changed: true }
    })
  },

  async findTransactions(
    walletId: string,
    options: { limit: number; offset: number }
  ): Promise<{ data: WalletTransactionRecord[]; total: number }> {
    const base = walletTransactions().where('wallet_id', '==', walletId)
    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])
    return { data: toDocs<WalletTransactionDocument>(snapshot.docs), total }
  },

  async findWithdrawalById(id: string): Promise<WithdrawalRequestRecord | null> {
    if (!id) return null
    return toDoc<WithdrawalRequestDocument>(await withdrawals().doc(id).get())
  },

  async paginateWithdrawals(
    filters: { owner_id?: string; status?: WithdrawalStatus },
    options: { limit: number; offset: number }
  ): Promise<{ data: WithdrawalRequestRecord[]; total: number }> {
    let base = withdrawals() as FirebaseFirestore.Query<WithdrawalRequestDocument>
    if (filters.owner_id) base = base.where('owner_id', '==', filters.owner_id)
    if (filters.status) base = base.where('status', '==', filters.status)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])
    return { data: toDocs<WithdrawalRequestDocument>(snapshot.docs), total }
  },
}

export default Wallet
