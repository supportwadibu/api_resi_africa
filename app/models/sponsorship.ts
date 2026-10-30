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

import {
  assertRedemption,
  buildSponsorshipCode,
  type RedemptionRule,
  type RedemptionType,
  type RewardRule,
  type SponsorshipRole,
} from '#features/sponsorships/sponsorship_rules'
import type { BookingDocument } from '#models/booking'
import type { BookingPaymentDocument } from '#models/booking_payment'
import { subscriptionCredits, type SubscriptionCreditDocument } from '#models/subscription_credit'

/**
 * Parrainage : cinq collections.
 *
 * - `sponsorship_codes` — un document par code, d'identifiant le code : deux
 *   comptes ne peuvent pas tirer le même, Firestore n'ayant pas d'index unique ;
 * - `sponsorship_accounts` — le compte du parrain, d'identifiant son
 *   `user_id` : son code, son solde de gains et son crédit séjour ;
 * - `sponsorships` — un document par filleul, d'identifiant le `user_id` du
 *   filleul : un filleul n'a qu'un parrain, et son gain unique y est porté ;
 * - `sponsorship_transactions` — le journal de chaque mouvement du compte ;
 * - `sponsorship_redemptions` — les retraits et conversions demandés.
 *
 * Comme le portefeuille, les soldes ne sont jamais recalculés depuis le
 * journal : chaque mouvement les ajuste dans la transaction qui écrit sa
 * ligne. Les lignes ont un identifiant dérivé de ce qui les cause — le
 * rejouer ne crédite pas deux fois.
 */

export interface SponsorshipCodeDocument {
  user_id: string
  created_at: Date
}

export interface SponsorshipAccountDocument {
  user_id: string
  role: SponsorshipRole
  code: string
  /** Gains disponibles : retirables ou convertibles. Peut être négatif après l'annulation d'un gain déjà dépensé. */
  balance: number
  /** Gains acquis, encore dans leur délai d'attente. */
  pending_balance: number
  /** Crédit séjour d'un client, déduit de ses prochaines réservations. */
  stay_credit: number
  total_earned: number
  total_redeemed: number
  created_at: Date
  updated_at: Date
}

export type SponsorshipAccountRecord = WithId<SponsorshipAccountDocument>

/**
 * - `registered` : inscrit, pas encore d'action qui rapporte ;
 * - `pending` : gain acquis, dans son délai d'attente ;
 * - `earned` : gain disponible au parrain ;
 * - `cancelled` : gain annulé par l'équipe ou par un remboursement.
 */
export const SPONSORSHIP_STATUSES = ['registered', 'pending', 'earned', 'cancelled'] as const
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number]

export const SPONSORSHIP_TRIGGERS = ['booking_completed', 'subscription_paid'] as const
export type SponsorshipTrigger = (typeof SPONSORSHIP_TRIGGERS)[number]

export interface SponsorshipDocument {
  sponsor_id: string
  sponsor_role: SponsorshipRole
  sponsored_id: string
  sponsored_role: SponsorshipRole
  /** Nom du filleul figé à l'inscription, comme `client_snapshot`. */
  sponsored_name: string
  code: string
  status: SponsorshipStatus
  reward_amount: number
  /** Règle appliquée, figée au gain : changer le réglage ne réécrit pas l'historique. */
  reward_rule: RewardRule | null
  trigger: SponsorshipTrigger | null
  /** Réservation ou paiement d'abonnement qui a déclenché le gain. */
  trigger_ref_id: string | null
  /** Montant payé sur lequel le gain a été calculé. */
  trigger_amount: number | null
  available_at: Date | null
  qualified_at: Date | null
  earned_at: Date | null
  cancelled_at: Date | null
  cancellation_reason: string | null
  cancelled_by: string | null
  created_at: Date
  updated_at: Date
}

export type SponsorshipRecord = WithId<SponsorshipDocument>

export const SPONSORSHIP_TRANSACTION_TYPES = [
  'reward',
  'reward_reversal',
  'withdrawal',
  'withdrawal_reversal',
  'stay_credit_conversion',
  'subscription_credit_conversion',
  'stay_credit_spent',
  'stay_credit_restored',
] as const
export type SponsorshipTransactionType = (typeof SPONSORSHIP_TRANSACTION_TYPES)[number]

export interface SponsorshipTransactionDocument {
  user_id: string
  type: SponsorshipTransactionType
  /** Signés : variation des gains disponibles et du crédit séjour. */
  balance_delta: number
  stay_credit_delta: number
  balance_after: number
  stay_credit_after: number
  sponsorship_id: string | null
  redemption_id: string | null
  booking_id: string | null
  created_at: Date
}

export type SponsorshipTransactionRecord = WithId<SponsorshipTransactionDocument>

/**
 * - `pending` : retrait à verser par l'équipe ;
 * - `paid` / `rejected` : retrait traité — refusé, le montant revient ;
 * - `completed` : conversion, appliquée sur-le-champ.
 */
export const REDEMPTION_STATUSES = ['pending', 'paid', 'rejected', 'completed'] as const
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number]

export interface SponsorshipRedemptionDocument {
  user_id: string
  user_role: SponsorshipRole
  type: RedemptionType
  amount: number
  status: RedemptionStatus
  /** Numéro Wave et titulaire, figés à la demande. Retrait seulement. */
  payout_phone: string | null
  payout_name: string | null
  payout_reference: string | null
  rejection_reason: string | null
  processed_at: Date | null
  processed_by: string | null
  created_at: Date
  updated_at: Date
}

export type SponsorshipRedemptionRecord = WithId<SponsorshipRedemptionDocument>

/** Paiement couvert entièrement par le crédit séjour : aucune session Wave. */
export function stayCreditPaymentId(bookingId: string): string {
  return `SPONSORSHIP-${bookingId}`
}

function codes() {
  return collection<SponsorshipCodeDocument>(COLLECTIONS.sponsorshipCodes)
}
function accounts() {
  return collection<SponsorshipAccountDocument>(COLLECTIONS.sponsorshipAccounts)
}
function sponsorships() {
  return collection<SponsorshipDocument>(COLLECTIONS.sponsorships)
}
function ledger() {
  return collection<SponsorshipTransactionDocument>(COLLECTIONS.sponsorshipTransactions)
}
function redemptions() {
  return collection<SponsorshipRedemptionDocument>(COLLECTIONS.sponsorshipRedemptions)
}
function bookings() {
  return collection<BookingDocument>(COLLECTIONS.bookings)
}
function bookingPayments() {
  return collection<BookingPaymentDocument>(COLLECTIONS.bookingPayments)
}

/** Tirages de code avant d'abandonner : avec 31⁴ suffixes par préfixe, une collision est rare. */
const CODE_ATTEMPTS = 6

function ledgerLine(
  account: SponsorshipAccountDocument,
  input: Omit<
    SponsorshipTransactionDocument,
    | 'user_id'
    | 'balance_after'
    | 'stay_credit_after'
    | 'sponsorship_id'
    | 'redemption_id'
    | 'booking_id'
  > &
    Partial<Pick<SponsorshipTransactionDocument, 'sponsorship_id' | 'redemption_id' | 'booking_id'>>
): SponsorshipTransactionDocument {
  return {
    user_id: account.user_id,
    type: input.type,
    balance_delta: input.balance_delta,
    stay_credit_delta: input.stay_credit_delta,
    balance_after: account.balance,
    stay_credit_after: account.stay_credit,
    sponsorship_id: input.sponsorship_id ?? null,
    redemption_id: input.redemption_id ?? null,
    booking_id: input.booking_id ?? null,
    created_at: input.created_at,
  }
}

function write<T extends object>(data: T): T {
  return toPayload(data) as unknown as T
}

const Sponsorship = {
  // ---------------------------------------------------------------- comptes

  async findAccount(userId: string): Promise<SponsorshipAccountRecord | null> {
    if (!userId) return null
    return toDoc<SponsorshipAccountDocument>(await accounts().doc(userId).get())
  },

  /**
   * Compte du parrain, créé à la première demande avec son code.
   *
   * Créé à la demande plutôt qu'à l'inscription : les comptes antérieurs au
   * parrainage en reçoivent un sans migration.
   */
  async ensureAccount(input: {
    user_id: string
    role: SponsorshipRole
    full_name: string
  }): Promise<SponsorshipAccountRecord> {
    const existing = await Sponsorship.findAccount(input.user_id)
    if (existing) return existing

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = buildSponsorshipCode(input.full_name)
      const accountRef = accounts().doc(input.user_id)
      const codeRef = codes().doc(code)

      const created = await transaction(async (tx) => {
        const [accountSnap, codeSnap] = await Promise.all([tx.get(accountRef), tx.get(codeRef)])
        // Deux premières lectures simultanées : la seconde trouve le compte.
        const current = toDoc<SponsorshipAccountDocument>(accountSnap)
        if (current) return current
        if (codeSnap.exists) return null

        const now = new Date()
        const account: SponsorshipAccountDocument = {
          user_id: input.user_id,
          role: input.role,
          code,
          balance: 0,
          pending_balance: 0,
          stay_credit: 0,
          total_earned: 0,
          total_redeemed: 0,
          created_at: now,
          updated_at: now,
        }
        tx.set(codeRef, write({ user_id: input.user_id, created_at: now }))
        tx.set(accountRef, write(account))
        return { ...account, _id: input.user_id }
      })

      if (created) return created
    }

    throw new Error('sponsorship_code_exhausted')
  },

  /** Titulaire d'un code, `null` s'il n'existe pas. */
  async findCodeOwner(code: string): Promise<string | null> {
    const doc = toDoc<SponsorshipCodeDocument>(await codes().doc(code).get())
    return doc?.user_id ?? null
  },

  // ------------------------------------------------------------ parrainages

  async findBySponsored(sponsoredId: string): Promise<SponsorshipRecord | null> {
    if (!sponsoredId) return null
    return toDoc<SponsorshipDocument>(await sponsorships().doc(sponsoredId).get())
  },

  async findById(id: string): Promise<SponsorshipRecord | null> {
    return Sponsorship.findBySponsored(id)
  },

  /** Rattache le filleul à son parrain. `false` s'il en avait déjà un. */
  async create(
    input: Pick<
      SponsorshipDocument,
      'sponsor_id' | 'sponsor_role' | 'sponsored_id' | 'sponsored_role' | 'sponsored_name' | 'code'
    >
  ): Promise<SponsorshipRecord | null> {
    const ref = sponsorships().doc(input.sponsored_id)
    return transaction(async (tx) => {
      const existing = await tx.get(ref)
      if (existing.exists) return null

      const now = new Date()
      const doc: SponsorshipDocument = {
        ...input,
        status: 'registered',
        reward_amount: 0,
        reward_rule: null,
        trigger: null,
        trigger_ref_id: null,
        trigger_amount: null,
        available_at: null,
        qualified_at: null,
        earned_at: null,
        cancelled_at: null,
        cancellation_reason: null,
        cancelled_by: null,
        created_at: now,
        updated_at: now,
      }
      tx.set(ref, write(doc))
      return { ...doc, _id: input.sponsored_id }
    })
  },

  /**
   * Filleuls d'un parrain, du plus récent au plus ancien.
   *
   * Lus en entier et triés en mémoire : un parrain en compte quelques
   * dizaines, et un tri Firestore exigerait un index composite de plus.
   */
  async listBySponsor(sponsorId: string): Promise<SponsorshipRecord[]> {
    const snapshot = await sponsorships().where('sponsor_id', '==', sponsorId).get()
    return toDocs<SponsorshipDocument>(snapshot.docs).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    )
  },

  /**
   * Le compte a-t-il déjà fait une action qui rapporte ? Un code saisi après
   * coup ne doit pas faire payer à RESI un gain sur un client déjà acquis :
   * le parrainage récompense une inscription, pas un paiement passé.
   */
  async hasPaidActivity(userId: string, role: SponsorshipRole): Promise<boolean> {
    if (role === 'client') {
      const snapshot = await bookingPayments()
        .where('client_id', '==', userId)
        .where('status', '==', 'success')
        .limit(1)
        .get()
      return !snapshot.empty
    }
    const snapshot = await collection(COLLECTIONS.subscriptions)
      .where('user_id', '==', userId)
      .where('is_trial', '==', false)
      .limit(1)
      .get()
    return !snapshot.empty
  },

  async listPending(): Promise<SponsorshipRecord[]> {
    const snapshot = await sponsorships().where('status', '==', 'pending').get()
    return toDocs<SponsorshipDocument>(snapshot.docs)
  },

  async paginate(
    filters: { status?: SponsorshipStatus; sponsor_id?: string },
    options: { limit: number; offset: number }
  ): Promise<{ data: SponsorshipRecord[]; total: number }> {
    let base = sponsorships() as FirebaseFirestore.Query<SponsorshipDocument>
    if (filters.status) base = base.where('status', '==', filters.status)
    if (filters.sponsor_id) base = base.where('sponsor_id', '==', filters.sponsor_id)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])
    return { data: toDocs<SponsorshipDocument>(snapshot.docs), total }
  },

  /**
   * Attribue le gain du filleul à son parrain, une seule fois.
   *
   * Rien ne se passe si le parrainage n'est plus `registered` : le gain est
   * déjà acquis, ou annulé. Disponible sur-le-champ quand le délai d'attente
   * est nul, en attente sinon.
   */
  async qualify(
    sponsoredId: string,
    input: {
      reward: number
      rule: RewardRule
      trigger: SponsorshipTrigger
      trigger_ref_id: string
      trigger_amount: number
      available_at: Date
      now: Date
    }
  ): Promise<SponsorshipRecord | null> {
    const ref = sponsorships().doc(sponsoredId)

    return transaction(async (tx) => {
      const current = toDoc<SponsorshipDocument>(await tx.get(ref))
      if (!current || current.status !== 'registered') return null

      const accountRef = accounts().doc(current.sponsor_id)
      const account = toDoc<SponsorshipAccountDocument>(await tx.get(accountRef))
      if (!account) return null

      const immediate = input.available_at.getTime() <= input.now.getTime()
      const patch: Partial<SponsorshipDocument> = {
        status: immediate ? 'earned' : 'pending',
        reward_amount: input.reward,
        reward_rule: input.rule,
        trigger: input.trigger,
        trigger_ref_id: input.trigger_ref_id,
        trigger_amount: input.trigger_amount,
        available_at: input.available_at,
        qualified_at: input.now,
        earned_at: immediate ? input.now : null,
        updated_at: input.now,
      }

      const next: SponsorshipAccountDocument = immediate
        ? {
            ...account,
            balance: account.balance + input.reward,
            total_earned: account.total_earned + input.reward,
            updated_at: input.now,
          }
        : {
            ...account,
            pending_balance: account.pending_balance + input.reward,
            updated_at: input.now,
          }

      tx.update(ref, write(patch))
      tx.set(accountRef, write(next))
      if (immediate) {
        tx.set(
          ledger().doc(`reward_${sponsoredId}`),
          write(
            ledgerLine(next, {
              type: 'reward',
              balance_delta: input.reward,
              stay_credit_delta: 0,
              sponsorship_id: sponsoredId,
              created_at: input.now,
            })
          )
        )
      }
      return { ...current, ...patch } as SponsorshipRecord
    })
  },

  /** Rend disponible un gain sorti de son délai d'attente. */
  async release(sponsoredId: string, now: Date): Promise<boolean> {
    const ref = sponsorships().doc(sponsoredId)

    return transaction(async (tx) => {
      const current = toDoc<SponsorshipDocument>(await tx.get(ref))
      if (!current || current.status !== 'pending') return false
      if (!current.available_at || current.available_at.getTime() > now.getTime()) return false

      const accountRef = accounts().doc(current.sponsor_id)
      const account = toDoc<SponsorshipAccountDocument>(await tx.get(accountRef))
      if (!account) return false

      const reward = current.reward_amount
      const next: SponsorshipAccountDocument = {
        ...account,
        pending_balance: Math.max(0, account.pending_balance - reward),
        balance: account.balance + reward,
        total_earned: account.total_earned + reward,
        updated_at: now,
      }

      tx.update(ref, write({ status: 'earned', earned_at: now, updated_at: now }))
      tx.set(accountRef, write(next))
      tx.set(
        ledger().doc(`reward_${sponsoredId}`),
        write(
          ledgerLine(next, {
            type: 'reward',
            balance_delta: reward,
            stay_credit_delta: 0,
            sponsorship_id: sponsoredId,
            created_at: now,
          })
        )
      )
      return true
    })
  },

  /**
   * Annule le gain d'un filleul.
   *
   * Un gain déjà disponible est repris sur le solde, qui peut devenir
   * négatif s'il a déjà été dépensé : la dette se solde sur les gains
   * suivants, et aucune demande n'est possible d'ici là — comme le
   * portefeuille après un remboursement.
   */
  async cancel(
    sponsoredId: string,
    input: { reason: string; cancelled_by: string | null; now: Date; only_pending?: boolean }
  ): Promise<{ record: SponsorshipRecord; changed: boolean } | null> {
    const ref = sponsorships().doc(sponsoredId)

    return transaction(async (tx) => {
      const current = toDoc<SponsorshipDocument>(await tx.get(ref))
      if (!current) return null
      if (current.status === 'cancelled') return { record: current, changed: false }
      if (input.only_pending && current.status !== 'pending')
        return { record: current, changed: false }

      const accountRef = accounts().doc(current.sponsor_id)
      const account = toDoc<SponsorshipAccountDocument>(await tx.get(accountRef))
      const reward = current.reward_amount

      if (account && current.status === 'pending') {
        tx.set(
          accountRef,
          write({
            ...account,
            pending_balance: Math.max(0, account.pending_balance - reward),
            updated_at: input.now,
          })
        )
      }

      if (account && current.status === 'earned') {
        const next: SponsorshipAccountDocument = {
          ...account,
          balance: account.balance - reward,
          total_earned: account.total_earned - reward,
          updated_at: input.now,
        }
        tx.set(accountRef, write(next))
        tx.set(
          ledger().doc(`reward_reversal_${sponsoredId}`),
          write(
            ledgerLine(next, {
              type: 'reward_reversal',
              balance_delta: -reward,
              stay_credit_delta: 0,
              sponsorship_id: sponsoredId,
              created_at: input.now,
            })
          )
        )
      }

      const patch: Partial<SponsorshipDocument> = {
        status: 'cancelled',
        cancelled_at: input.now,
        cancellation_reason: input.reason,
        cancelled_by: input.cancelled_by,
        updated_at: input.now,
      }
      tx.update(ref, write(patch))
      return { record: { ...current, ...patch } as SponsorshipRecord, changed: true }
    })
  },

  // ---------------------------------------------------------------- journal

  async findTransactions(
    userId: string,
    options: { limit: number; offset: number }
  ): Promise<{ data: SponsorshipTransactionRecord[]; total: number }> {
    const base = ledger().where('user_id', '==', userId)
    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])
    return { data: toDocs<SponsorshipTransactionDocument>(snapshot.docs), total }
  },

  // ------------------------------------------------------ retraits, conversions

  /**
   * Débite le solde pour un retrait ou une conversion.
   *
   * Le seuil et le solde sont vérifiés dans la transaction : deux demandes
   * simultanées ne dépensent pas deux fois le même gain. Une conversion est
   * appliquée sur-le-champ — crédit séjour sur le compte, crédit
   * d'abonnement sur le document que lit la souscription.
   */
  async redeem(input: {
    user_id: string
    type: RedemptionType
    amount: number
    rule: RedemptionRule
    payout_phone: string | null
    payout_name: string | null
    subscription_credit_expires_at: Date
    now: Date
  }): Promise<SponsorshipRedemptionRecord | null> {
    const accountRef = accounts().doc(input.user_id)
    const redemptionRef = redemptions().doc()
    const creditRef = subscriptionCredits().doc(input.user_id)

    return transaction(async (tx) => {
      const [accountSnap, creditSnap] = await Promise.all([
        tx.get(accountRef),
        input.type === 'subscription_credit' ? tx.get(creditRef) : Promise.resolve(null),
      ])
      const account = toDoc<SponsorshipAccountDocument>(accountSnap)
      if (!account) return null

      assertRedemption({
        type: input.type,
        amount: input.amount,
        role: account.role,
        balance: account.balance,
        rule: input.rule,
      })

      const isWithdrawal = input.type === 'withdrawal'
      const stayCredit = input.type === 'stay_credit' ? input.amount : 0
      const redemption: SponsorshipRedemptionDocument = {
        user_id: input.user_id,
        user_role: account.role,
        type: input.type,
        amount: input.amount,
        status: isWithdrawal ? 'pending' : 'completed',
        payout_phone: isWithdrawal ? input.payout_phone : null,
        payout_name: isWithdrawal ? input.payout_name : null,
        payout_reference: null,
        rejection_reason: null,
        processed_at: isWithdrawal ? null : input.now,
        processed_by: null,
        created_at: input.now,
        updated_at: input.now,
      }
      const next: SponsorshipAccountDocument = {
        ...account,
        balance: account.balance - input.amount,
        stay_credit: account.stay_credit + stayCredit,
        total_redeemed: account.total_redeemed + input.amount,
        updated_at: input.now,
      }

      if (input.type === 'subscription_credit') {
        // S'ajoute au crédit gardé d'une résiliation : même document, même
        // déduction à la prochaine souscription. L'échéance la plus lointaine
        // l'emporte, pour qu'un gain neuf ne raccourcisse pas un crédit ancien.
        const credit = creditSnap ? toDoc<SubscriptionCreditDocument>(creditSnap) : null
        const stillValid = credit && credit.expires_at.getTime() > input.now.getTime()
        const expiresAt =
          credit && credit.expires_at.getTime() > input.subscription_credit_expires_at.getTime()
            ? credit.expires_at
            : input.subscription_credit_expires_at
        tx.set(
          creditRef,
          write({
            user_id: input.user_id,
            amount: (stillValid ? credit.amount : 0) + input.amount,
            expires_at: expiresAt,
            source_subscription_id: credit?.source_subscription_id ?? null,
            full_refund_used_at: credit?.full_refund_used_at ?? null,
            created_at: credit?.created_at ?? input.now,
            updated_at: input.now,
          } satisfies SubscriptionCreditDocument)
        )
      }

      tx.set(redemptionRef, write(redemption))
      tx.set(accountRef, write(next))
      tx.set(
        ledger().doc(`redemption_${redemptionRef.id}`),
        write(
          ledgerLine(next, {
            type:
              input.type === 'withdrawal'
                ? 'withdrawal'
                : input.type === 'stay_credit'
                  ? 'stay_credit_conversion'
                  : 'subscription_credit_conversion',
            balance_delta: -input.amount,
            stay_credit_delta: stayCredit,
            redemption_id: redemptionRef.id,
            created_at: input.now,
          })
        )
      )
      return { ...redemption, _id: redemptionRef.id }
    })
  },

  async findRedemption(id: string): Promise<SponsorshipRedemptionRecord | null> {
    if (!id) return null
    return toDoc<SponsorshipRedemptionDocument>(await redemptions().doc(id).get())
  },

  /**
   * Clôt un retrait : versé par l'équipe, ou refusé — le montant revient
   * alors au solde. `changed: false` s'il était déjà traité.
   */
  async resolveRedemption(
    id: string,
    input: {
      status: 'paid' | 'rejected'
      processed_by: string
      payout_reference: string | null
      rejection_reason: string | null
      now: Date
    }
  ): Promise<{ record: SponsorshipRedemptionRecord; changed: boolean } | null> {
    const ref = redemptions().doc(id)

    return transaction(async (tx) => {
      const current = toDoc<SponsorshipRedemptionDocument>(await tx.get(ref))
      if (!current || current.type !== 'withdrawal') return null
      if (current.status !== 'pending') return { record: current, changed: false }

      const accountRef = accounts().doc(current.user_id)
      const account =
        input.status === 'rejected'
          ? toDoc<SponsorshipAccountDocument>(await tx.get(accountRef))
          : null

      const patch: Partial<SponsorshipRedemptionDocument> = {
        status: input.status,
        payout_reference: input.payout_reference,
        rejection_reason: input.rejection_reason,
        processed_at: input.now,
        processed_by: input.processed_by,
        updated_at: input.now,
      }
      tx.update(ref, write(patch))

      if (account) {
        const next: SponsorshipAccountDocument = {
          ...account,
          balance: account.balance + current.amount,
          total_redeemed: account.total_redeemed - current.amount,
          updated_at: input.now,
        }
        tx.set(accountRef, write(next))
        tx.set(
          ledger().doc(`redemption_reversal_${id}`),
          write(
            ledgerLine(next, {
              type: 'withdrawal_reversal',
              balance_delta: current.amount,
              stay_credit_delta: 0,
              redemption_id: id,
              created_at: input.now,
            })
          )
        )
      }

      return { record: { ...current, ...patch } as SponsorshipRedemptionRecord, changed: true }
    })
  },

  async paginateRedemptions(
    filters: { user_id?: string; status?: RedemptionStatus; type?: RedemptionType },
    options: { limit: number; offset: number }
  ): Promise<{ data: SponsorshipRedemptionRecord[]; total: number }> {
    let base = redemptions() as FirebaseFirestore.Query<SponsorshipRedemptionDocument>
    if (filters.user_id) base = base.where('user_id', '==', filters.user_id)
    if (filters.type) base = base.where('type', '==', filters.type)
    if (filters.status) base = base.where('status', '==', filters.status)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])
    return { data: toDocs<SponsorshipRedemptionDocument>(snapshot.docs), total }
  },

  // ------------------------------------------------------------ crédit séjour

  /**
   * Déduit le crédit séjour du client d'une réservation en ligne non payée.
   *
   * Une seule application par réservation : le montant restant dû est figé
   * pour la session Wave qui suit. Si le crédit couvre tout le séjour, le
   * paiement est enregistré réussi dans la même transaction — aucune session
   * Wave n'est ouverte.
   */
  async applyStayCredit(input: { booking_id: string; client_id: string; now: Date }): Promise<
    | { ok: true; amount: number; fully_paid: boolean; booking: WithId<BookingDocument> }
    | {
        ok: false
        reason:
          | 'booking_not_found'
          | 'booking_not_payable'
          | 'booking_already_paid'
          | 'credit_already_applied'
          | 'no_stay_credit'
      }
  > {
    const bookingRef = bookings().doc(input.booking_id)
    const accountRef = accounts().doc(input.client_id)
    const paidQuery = bookingPayments()
      .where('booking_id', '==', input.booking_id)
      .where('status', '==', 'success')
      .limit(1)

    return transaction(async (tx) => {
      const [bookingSnap, accountSnap, paidSnap] = await Promise.all([
        tx.get(bookingRef),
        tx.get(accountRef),
        tx.get(paidQuery),
      ])
      const booking = toDoc<BookingDocument>(bookingSnap)
      if (!booking || booking.client_id !== input.client_id) {
        return { ok: false, reason: 'booking_not_found' } as const
      }
      if (booking.status !== 'confirmed' || booking.source === 'offline') {
        return { ok: false, reason: 'booking_not_payable' } as const
      }
      if (!paidSnap.empty) return { ok: false, reason: 'booking_already_paid' } as const
      if ((booking.sponsorship_credit_amount ?? 0) > 0) {
        return { ok: false, reason: 'credit_already_applied' } as const
      }

      const account = toDoc<SponsorshipAccountDocument>(accountSnap)
      const amount = Math.min(Math.floor(account?.stay_credit ?? 0), booking.total_amount)
      if (!account || amount <= 0) return { ok: false, reason: 'no_stay_credit' } as const

      const next: SponsorshipAccountDocument = {
        ...account,
        stay_credit: account.stay_credit - amount,
        updated_at: input.now,
      }
      tx.update(bookingRef, write({ sponsorship_credit_amount: amount, updated_at: input.now }))
      tx.set(accountRef, write(next))
      tx.set(
        ledger().doc(`stay_credit_spent_${input.booking_id}`),
        write(
          ledgerLine(next, {
            type: 'stay_credit_spent',
            balance_delta: 0,
            stay_credit_delta: -amount,
            booking_id: input.booking_id,
            created_at: input.now,
          })
        )
      )

      const fullyPaid = amount >= booking.total_amount
      if (fullyPaid) {
        const id = stayCreditPaymentId(input.booking_id)
        tx.set(
          bookingPayments().doc(id),
          write({
            booking_id: input.booking_id,
            client_id: booking.client_id,
            owner_id: booking.owner_id,
            property_id: booking.property_id,
            amount: 0,
            currency: 'XOF',
            provider: 'sponsorship_credit',
            status: 'success',
            transaction_reference: id,
            provider_checkout_id: null,
            provider_transaction_id: null,
            payment_url: null,
            callback_event_id: null,
            failure_reason: null,
            paid_at: input.now,
            cancelled_at: null,
            expired_at: null,
            metadata: { sponsorship_credit_amount: amount },
            provider_payload: {},
            created_at: input.now,
            updated_at: input.now,
          } satisfies BookingPaymentDocument)
        )
      }

      return {
        ok: true,
        amount,
        fully_paid: fullyPaid,
        booking: { ...booking, sponsorship_credit_amount: amount },
      } as const
    })
  },

  /**
   * Rend au client le crédit séjour d'une réservation qui n'aura pas lieu.
   * Idempotent : la ligne du journal porte l'identifiant de la réservation.
   */
  async restoreStayCredit(input: {
    booking_id: string
    client_id: string
    amount: number
    now: Date
  }): Promise<boolean> {
    if (!(input.amount > 0)) return false
    const accountRef = accounts().doc(input.client_id)
    const lineRef = ledger().doc(`stay_credit_restored_${input.booking_id}`)

    return transaction(async (tx) => {
      const [accountSnap, lineSnap] = await Promise.all([tx.get(accountRef), tx.get(lineRef)])
      if (lineSnap.exists) return false
      const account = toDoc<SponsorshipAccountDocument>(accountSnap)
      if (!account) return false

      const next: SponsorshipAccountDocument = {
        ...account,
        stay_credit: account.stay_credit + input.amount,
        updated_at: input.now,
      }
      tx.set(accountRef, write(next))
      tx.set(
        lineRef,
        write(
          ledgerLine(next, {
            type: 'stay_credit_restored',
            balance_delta: 0,
            stay_credit_delta: input.amount,
            booking_id: input.booking_id,
            created_at: input.now,
          })
        )
      )
      return true
    })
  },
}

export default Sponsorship
