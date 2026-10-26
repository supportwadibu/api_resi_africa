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

import { usableCredit } from '#features/subscriptions/cancellation_policy'
import type { SubscriptionDocument } from '#models/subscription'
import { subscriptionCredits, type SubscriptionCreditDocument } from '#models/subscription_credit'

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
  /**
   * Part du solde retirable sans frais : les remboursements d'abonnement.
   * RESI rend là un argent que le propriétaire avait payé, et y prélever 1 %
   * reviendrait à ne pas le rendre en entier. Absente sur l'historique : 0.
   */
  fee_free_balance?: number
  created_at: Date
  updated_at: Date
}

export type WalletRecord = WithId<WalletDocument>

export const WALLET_TRANSACTION_TYPES = [
  'credit',
  'withdrawal',
  'withdrawal_reversal',
  // Paiement rendu au client par Wave à l'annulation : RESI a rendu l'argent,
  // le propriétaire ne le lui doit plus.
  'refund',
  // Jours d'abonnement non consommés, rendus à la résiliation.
  'subscription_refund',
] as const
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
  /** Abonnement résilié, pour un `subscription_refund`. Absent ailleurs. */
  subscription_id?: string | null
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
  /**
   * Part du montant prise sur `fee_free_balance`, sans frais : rendue à ce
   * solde si la demande est refusée. Absente sur l'historique : 0.
   */
  fee_free_amount?: number
  /** Numéro Wave du versement, figé à la demande. */
  payout_phone: string
  /** Nom du titulaire, figé à la demande, pour que l'équipe vérifie le compte. */
  payout_name: string | null
  /**
   * Position du numéro Wave enregistré choisi (1 ou 2). Absente sur
   * l'historique et sur les demandes d'une application antérieure aux
   * numéros enregistrés, qui saisissaient le numéro à la main.
   */
  payout_slot?: number | null
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
    fee_free_balance: 0,
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
          fee_free_balance: current.fee_free_balance ?? 0,
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
   * Débite le portefeuille d'un paiement remboursé au client.
   *
   * Idempotent, comme le crédit : la ligne porte l'identifiant du paiement.
   *
   * Le solde peut devenir négatif : le propriétaire a pu retirer l'argent
   * avant l'annulation, et le client doit être remboursé quand même. Le solde
   * négatif est une dette, soldée par les prochains paiements — aucun retrait
   * n'est possible d'ici là.
   */
  async debitRefund(input: {
    wallet_id: string
    owner_id: string
    residence_id: string | null
    booking_id: string
    booking_payment_id: string
    amount: number
  }): Promise<boolean> {
    const walletRef = wallets().doc(input.wallet_id)
    const lineRef = walletTransactions().doc(`refund_${input.booking_payment_id}`)

    return transaction(async (tx) => {
      const [walletSnap, lineSnap] = await Promise.all([tx.get(walletRef), tx.get(lineRef)])
      if (lineSnap.exists) return false

      const now = new Date()
      const current =
        toDoc<WalletDocument>(walletSnap) ?? emptyWallet(input.owner_id, input.residence_id, now)
      const balance = current.balance - input.amount

      tx.set(
        walletRef,
        toPayload({
          owner_id: current.owner_id,
          residence_id: current.residence_id,
          balance,
          total_credited: current.total_credited,
          total_withdrawn: current.total_withdrawn,
          // Un solde réduit par un remboursement client ne peut porter plus
          // d'exonération qu'il ne lui reste d'argent.
          fee_free_balance: Math.min(current.fee_free_balance ?? 0, Math.max(0, balance)),
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
          type: 'refund',
          amount: -input.amount,
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
   * Résilie un abonnement et rend ses jours non consommés au portefeuille.
   *
   * Une seule transaction pour les deux : un abonnement résilié sans
   * remboursement, ou un remboursement sans résiliation, ferait perdre son
   * argent au propriétaire ou le lui rendrait en lui laissant l'accès.
   *
   * Idempotent : l'abonnement n'est résilié que s'il est encore actif, et la
   * ligne du journal porte son identifiant — un double appui ne crédite
   * qu'une fois. Rend `false` si l'abonnement n'était plus actif.
   *
   * Le crédit alimente aussi `fee_free_balance` : retirer ce remboursement
   * ne coûte pas de frais.
   */
  async cancelSubscriptionWithRefund(input: {
    wallet_id: string
    owner_id: string
    subscription_id: string
    refund: number
    /**
     * Gardé en crédit bloqué, ajouté au crédit encore valable. 0 ou absent :
     * aucun crédit.
     */
    credit?: { amount: number; expires_at: Date } | null
    /**
     * Remboursement intégral : consomme le droit unique du propriétaire. La
     * résiliation est refusée (`false`) s'il a déjà servi — relu ici, dans la
     * transaction, et non seulement par l'appelant.
     */
    full_refund?: boolean
    reason: string
  }): Promise<boolean> {
    const subscriptionRef = collection<SubscriptionDocument>(COLLECTIONS.subscriptions).doc(
      input.subscription_id
    )
    const walletRef = wallets().doc(input.wallet_id)
    const lineRef = walletTransactions().doc(`subscription_refund_${input.subscription_id}`)
    const creditRef = subscriptionCredits().doc(input.owner_id)
    const creditAmount = Math.max(0, Math.floor(input.credit?.amount ?? 0))

    return transaction(async (tx) => {
      const [subscriptionSnap, walletSnap, lineSnap, creditSnap] = await Promise.all([
        tx.get(subscriptionRef),
        tx.get(walletRef),
        tx.get(lineRef),
        tx.get(creditRef),
      ])
      const subscription = toDoc<SubscriptionDocument>(subscriptionSnap)
      if (!subscription || subscription.user_id !== input.owner_id) return false
      if (subscription.status !== 'active' || lineSnap.exists) return false

      const previous = toDoc<SubscriptionCreditDocument>(creditSnap)
      if (input.full_refund && previous?.full_refund_used_at) return false

      const now = new Date()
      tx.update(
        subscriptionRef,
        toPayload({
          status: 'cancelled',
          cancelled_at: now,
          cancel_reason: input.reason,
          refunded_amount: input.refund,
          retained_credit: creditAmount > 0 ? creditAmount : null,
          updated_at: now,
        })
      )

      if ((creditAmount > 0 && input.credit) || input.full_refund) {
        // Un crédit encore valable s'ajoute au nouveau, et l'échéance repart
        // du dernier : deux résiliations ne doivent pas faire perdre le
        // premier crédit.
        tx.set(
          creditRef,
          toPayload({
            user_id: input.owner_id,
            amount: usableCredit(previous, now) + creditAmount,
            expires_at:
              creditAmount > 0 && input.credit
                ? input.credit.expires_at
                : (previous?.expires_at ?? now),
            source_subscription_id:
              creditAmount > 0 ? input.subscription_id : (previous?.source_subscription_id ?? null),
            full_refund_used_at: input.full_refund ? now : (previous?.full_refund_used_at ?? null),
            created_at: previous?.created_at ?? now,
            updated_at: now,
          } satisfies SubscriptionCreditDocument) as unknown as SubscriptionCreditDocument
        )
      }

      if (input.refund <= 0) return true

      const current = toDoc<WalletDocument>(walletSnap) ?? emptyWallet(input.owner_id, null, now)
      const balance = current.balance + input.refund
      tx.set(
        walletRef,
        toPayload({
          owner_id: current.owner_id,
          residence_id: current.residence_id,
          balance,
          total_credited: current.total_credited + input.refund,
          total_withdrawn: current.total_withdrawn,
          fee_free_balance: (current.fee_free_balance ?? 0) + input.refund,
          created_at: current.created_at,
          updated_at: now,
        }) as unknown as WalletDocument
      )
      tx.set(
        lineRef,
        toPayload({
          wallet_id: input.wallet_id,
          owner_id: input.owner_id,
          residence_id: null,
          type: 'subscription_refund',
          amount: input.refund,
          balance_after: balance,
          booking_id: null,
          booking_payment_id: null,
          withdrawal_id: null,
          subscription_id: input.subscription_id,
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
    payout_slot: number | null
    quote: (
      balance: number,
      feeFreeBalance: number
    ) => { amount: number; fee: number; net_amount: number; fee_free_amount: number }
  }): Promise<WithdrawalRequestRecord | null> {
    const walletRef = wallets().doc(input.wallet_id)
    const requestRef = withdrawals().doc()
    const lineRef = walletTransactions().doc(`withdrawal_${requestRef.id}`)

    return transaction(async (tx) => {
      const wallet = toDoc<WalletDocument>(await tx.get(walletRef))
      if (!wallet || wallet.owner_id !== input.owner_id) return null

      const feeFreeBalance = wallet.fee_free_balance ?? 0
      const quoted = input.quote(wallet.balance, feeFreeBalance)
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
        fee_free_amount: quoted.fee_free_amount,
        payout_phone: input.payout_phone,
        payout_name: input.payout_name,
        payout_slot: input.payout_slot,
        status: 'pending',
        payout_reference: null,
        rejection_reason: null,
        processed_at: null,
        processed_by: null,
        created_at: now,
        updated_at: now,
      }

      tx.update(walletRef, {
        balance,
        fee_free_balance: feeFreeBalance - quoted.fee_free_amount,
        updated_at: now,
      })
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
        tx.update(walletRef, {
          balance,
          fee_free_balance: (wallet.fee_free_balance ?? 0) + (request.fee_free_amount ?? 0),
          updated_at: now,
        })
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
