import { COLLECTIONS, collection, countQuery, db, deleteQuery, toDoc } from '#firebase/firestore'
import AuthAttempt from '#models/auth_attempt'
import OtpCode from '#models/otp_code'
import User from '#models/user'
import { deleteDocumentsByPrefix, isFileStorageConfigured } from '#services/document_storage'
import { deletePropertyImagesByPrefix } from '#services/property_image_storage'

import {
  isSponsorshipErasable,
  PURGE_STEPS,
  purgeFilePrefixes,
  type PurgeStep,
} from '../purge_plan.ts'

import type { BookingDocument } from '#models/booking'
import type { SponsorshipAccountDocument, SponsorshipDocument } from '#models/sponsorship'
import type { PurgeItemDto, PurgeWarningDto } from '../dto/user.dto.ts'

/** Plafond d'un lot d'écritures Firestore. */
const BATCH_LIMIT = 500

/** Séjours qui ne sont ni terminés ni annulés. */
const ONGOING_BOOKING_STATUSES = ['confirmed', 'in_progress']

const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR')

function formatAmount(value: number): string {
  return `${AMOUNT_FORMATTER.format(Math.round(value))} FCFA`
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

/**
 * Accès Firestore, Realtime Database et Cloudinary de la suppression
 * définitive d'un compte. Le plan lui-même vit dans `purge_plan.ts`.
 */
export class UserPurgeRepository {
  /** Volume de chaque ensemble du plan, vides exclus. */
  async countSteps(userId: string): Promise<PurgeItemDto[]> {
    const counts = await Promise.all(
      PURGE_STEPS.map(async (step) => ({
        key: step.key,
        label: step.label,
        count: await this.countStep(step, userId),
      }))
    )
    return counts.filter((item) => item.count > 0)
  }

  /**
   * Efface chaque ensemble du plan, l'un après l'autre.
   *
   * En série plutôt qu'en parallèle : une suppression peut toucher des
   * milliers de documents, et tout lancer d'un coup saturerait le quota
   * d'écriture du projet sans rien gagner sur une opération déjà rare.
   */
  async deleteSteps(userId: string): Promise<PurgeItemDto[]> {
    const out: PurgeItemDto[] = []
    for (const step of PURGE_STEPS) {
      const count = await this.deleteStep(step, userId)
      if (count > 0) out.push({ key: step.key, label: step.label, count })
    }
    return out
  }

  private async countStep(step: PurgeStep, userId: string): Promise<number> {
    if (step.kind === 'doc') {
      const snapshot = await collection(step.collection).doc(userId).get()
      return snapshot.exists ? 1 : 0
    }
    return countQuery(collection(step.collection).where(step.field, '==', userId))
  }

  private async deleteStep(step: PurgeStep, userId: string): Promise<number> {
    if (step.kind === 'doc') {
      const ref = collection(step.collection).doc(userId)
      const snapshot = await ref.get()
      if (!snapshot.exists) return 0
      await ref.delete()
      return 1
    }
    return deleteQuery(collection(step.collection).where(step.field, '==', userId))
  }

  /**
   * Parrainage hors plan : le code (clé de document, lue sur le compte de
   * parrainage) et, s'il n'a rien rapporté, le parrainage où le compte est
   * filleul. À appeler avant `deleteSteps`, qui efface le compte de
   * parrainage et avec lui le seul lien vers le code.
   */
  async deleteSponsorshipLinks(userId: string): Promise<PurgeItemDto[]> {
    const out: PurgeItemDto[] = []

    const account = toDoc<SponsorshipAccountDocument>(
      await collection(COLLECTIONS.sponsorshipAccounts).doc(userId).get()
    )
    if (account?.code) {
      await collection(COLLECTIONS.sponsorshipCodes).doc(account.code).delete()
      out.push({ key: 'sponsorship_code', label: 'Code de parrainage', count: 1 })
    }

    if (await this.isSponsoredErasable(userId)) {
      await collection(COLLECTIONS.sponsorships).doc(userId).delete()
      out.push({ key: 'sponsorship_as_sponsored', label: 'Parrainage reçu', count: 1 })
    }

    return out
  }

  /** Même lecture que `deleteSponsorshipLinks`, sans effacer. */
  async countSponsorshipLinks(userId: string): Promise<PurgeItemDto[]> {
    const out: PurgeItemDto[] = []

    const account = await collection(COLLECTIONS.sponsorshipAccounts).doc(userId).get()
    if (account.exists && account.get('code')) {
      out.push({ key: 'sponsorship_code', label: 'Code de parrainage', count: 1 })
    }
    if (await this.isSponsoredErasable(userId)) {
      out.push({ key: 'sponsorship_as_sponsored', label: 'Parrainage reçu', count: 1 })
    }

    return out
  }

  private async isSponsoredErasable(userId: string): Promise<boolean> {
    const sponsorship = toDoc<SponsorshipDocument>(
      await collection(COLLECTIONS.sponsorships).doc(userId).get()
    )
    return Boolean(sponsorship && isSponsorshipErasable(sponsorship.status))
  }

  /** Données d'autres comptes qui citent celui-ci et lui survivent. */
  async countKept(userId: string): Promise<PurgeItemDto[]> {
    const [bookings, payments] = await Promise.all([
      countQuery(collection(COLLECTIONS.bookings).where('client_id', '==', userId)),
      countQuery(collection(COLLECTIONS.bookingPayments).where('client_id', '==', userId)),
    ])

    return [
      { key: 'client_bookings', label: 'Séjours réservés chez des propriétaires', count: bookings },
      { key: 'client_payments', label: 'Paiements de ces séjours', count: payments },
    ].filter((item) => item.count > 0)
  }

  /**
   * Fige le nom du client sur ses réservations en ligne avant que le compte
   * ne disparaisse.
   *
   * Une réservation comptoir porte toujours `client_snapshot` ; une
   * réservation en ligne antérieure au champ, non : sans cette copie, le
   * propriétaire verrait un séjour sans client. Les réservations qui ont déjà
   * un instantané ne sont pas réécrites.
   */
  async freezeClientSnapshots(
    userId: string,
    snapshot: { full_name: string; phone: string }
  ): Promise<number> {
    const docs = await collection<BookingDocument>(COLLECTIONS.bookings)
      .where('client_id', '==', userId)
      .get()

    const missing = docs.docs.filter((doc) => !doc.get('client_snapshot'))

    for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
      const batch = db().batch()
      for (const doc of missing.slice(i, i + BATCH_LIMIT)) {
        batch.update(doc.ref, { client_snapshot: snapshot })
      }
      await batch.commit()
    }

    return missing.length
  }

  /**
   * Solde cumulé des portefeuilles du propriétaire.
   *
   * Lu et additionné ici plutôt que par un agrégat `sum` : Firestore exige
   * pour celui-ci un index composite (`owner_id`, `balance`), et un
   * propriétaire n'a qu'un portefeuille par résidence plus le général —
   * quelques documents.
   */
  private async walletBalance(userId: string): Promise<number> {
    const snapshot = await collection(COLLECTIONS.wallets).where('owner_id', '==', userId).get()
    // `balance` toujours écrit à la création, repli par prudence.
    return snapshot.docs.reduce((sum, doc) => sum + (Number(doc.get('balance')) || 0), 0)
  }

  /** Argent encore dû et séjours en cours, à signaler avant d'effacer. */
  async warnings(userId: string): Promise<PurgeWarningDto[]> {
    const [walletBalance, pendingWithdrawals, ownerStays, clientStays, sponsorship] =
      await Promise.all([
        this.walletBalance(userId),
        countQuery(
          collection(COLLECTIONS.withdrawalRequests)
            .where('owner_id', '==', userId)
            .where('status', '==', 'pending')
        ),
        countQuery(
          collection(COLLECTIONS.bookings)
            .where('owner_id', '==', userId)
            .where('status', 'in', ONGOING_BOOKING_STATUSES)
        ),
        countQuery(
          collection(COLLECTIONS.bookings)
            .where('client_id', '==', userId)
            .where('status', 'in', ONGOING_BOOKING_STATUSES)
        ),
        collection(COLLECTIONS.sponsorshipAccounts).doc(userId).get(),
      ])

    const out: PurgeWarningDto[] = []

    if (walletBalance > 0) {
      out.push({
        code: 'wallet_balance',
        message: `Portefeuille non vidé : ${formatAmount(walletBalance)} n'ont pas été versés au propriétaire.`,
      })
    }
    if (pendingWithdrawals > 0) {
      out.push({
        code: 'pending_withdrawals',
        message: `${plural(pendingWithdrawals, 'demande de retrait', 'demandes de retrait')} en attente de versement.`,
      })
    }
    if (ownerStays > 0) {
      out.push({
        code: 'owner_ongoing_bookings',
        message: `${plural(ownerStays, 'séjour', 'séjours')} en cours ou à venir dans ses logements : les clients perdront leur réservation.`,
      })
    }
    if (clientStays > 0) {
      out.push({
        code: 'client_ongoing_bookings',
        message: `${plural(clientStays, 'séjour', 'séjours')} en cours ou à venir chez des propriétaires : conservés chez eux.`,
      })
    }

    const account = sponsorship.exists ? (sponsorship.data() as SponsorshipAccountDocument) : null
    // Champs absents sur un compte de parrainage ancien : 0.
    const sponsorshipDue =
      (account?.balance ?? 0) + (account?.pending_balance ?? 0) + (account?.stay_credit ?? 0)
    if (sponsorshipDue > 0) {
      out.push({
        code: 'sponsorship_balance',
        message: `Gains et crédit de parrainage non utilisés : ${formatAmount(sponsorshipDue)}.`,
      })
    }

    return out
  }

  /**
   * Efface photos d'annonce et pièces d'identité ; rend le nombre de fichiers.
   *
   * Une erreur de l'hébergeur remonte : mieux vaut une suppression à relancer
   * qu'une pièce d'identité orpheline, que plus aucun document ne permettrait
   * de retrouver.
   */
  async deleteFiles(userId: string): Promise<number> {
    if (!isFileStorageConfigured()) return 0

    const prefixes = purgeFilePrefixes(userId)
    let total = 0
    for (const prefix of prefixes.images) total += await deletePropertyImagesByPrefix(prefix)
    for (const prefix of prefixes.documents) total += await deleteDocumentsByPrefix(prefix)
    return total
  }

  /** Codes OTP et tentatives de connexion, rangés par compte et par identifiant. */
  async deleteAuthTraces(userId: string, identifiers: (string | null)[]): Promise<void> {
    await OtpCode.deleteAllForUser(userId)
    for (const target of identifiers) {
      if (target) await AuthAttempt.deleteForTarget(target)
    }
  }

  async deleteUser(userId: string): Promise<void> {
    await User.destroy(userId)
  }
}

export default UserPurgeRepository
