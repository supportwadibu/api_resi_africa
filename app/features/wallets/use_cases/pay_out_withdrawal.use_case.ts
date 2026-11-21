import logger from '@adonisjs/core/services/logger'

import NotifyUserUseCase from '#features/notifications/use_cases/notify_user.use_case'
import type { PushMessage } from '#features/notifications/push_delivery'
import Wallet, { type WithdrawalRequestRecord } from '#models/wallet'
import { WaveApiError } from '#services/wave_client'
import WavePayoutClient, { type WavePayout } from '#services/wave_payout_client'
import { DomainError } from '#utils/domain_error'

import type { AdminWithdrawalDto } from '../dto/wallet.dto.ts'
import WalletRepository from '../repositories/wallet_repository.ts'

/** Délai avant de relire chez Wave un versement resté en cours. */
export const PAYOUT_RECHECK_AFTER_MS = 2 * 60 * 1000

/** Versements relus par passage de la tâche planifiée. */
const RECONCILE_BATCH = 50

/**
 * Durée de la réservation d'un versement par celui qui le traite : l'appel de
 * l'équipe, ou un passage de la relecture. Bien au-delà du délai d'un appel à
 * Wave (20 s) : deux traitements ne se chevauchent jamais sur une demande.
 */
export const PAYOUT_LEASE_MS = 2 * 60 * 1000

/**
 * Refus de Wave qui disent avec certitude que rien n'est parti : la requête a
 * été écartée avant toute exécution — compte bénéficiaire, solde, requête
 * invalide, clé ou signature refusée.
 *
 * Liste blanche, et non noire : un code inconnu, un 409 ou tout autre refus
 * laissent l'issue **inconnue**. Rouvrir la demande sur un faux refus
 * permettrait une seconde tentative, avec une autre clé, alors que l'argent
 * est peut-être parti.
 */
export const DEFINITE_REFUSALS: ReadonlySet<string> = new Set([
  // Contrôle local, avant tout appel.
  'invalid-amount',
  'missing-api-key',
  // Bénéficiaire, solde, monnaie.
  'insufficient-funds',
  'recipient-limit-exceeded',
  'recipient-account-blocked',
  'recipient-account-inactive',
  'recipient-minor',
  'country-mismatch',
  'currency-mismatch',
  'request-validation-error',
  // Authentification et compte : la requête n'a pas été traitée.
  'missing-auth-header',
  'invalid-auth',
  'api-key-not-provided',
  'no-matching-api-key',
  'api-key-revoked',
  'missing-signature',
  'invalid-signature-format',
  'invalid-signature',
  'invalid-signature-timestamp',
  'expired-signature-timestamp',
  'invalid-wallet',
  'disabled-wallet',
  'ip-not-allowed',
])

/**
 * Clé d'idempotence et `client_reference` d'une tentative : une par
 * tentative, stable tant que son issue est inconnue.
 */
export function payoutKey(request: { _id: string; payout_attempt?: number }): string {
  return `resi-wd-${request._id}-${request.payout_attempt ?? 1}`
}

/**
 * Numéro au format international exigé par Wave.
 *
 * Les numéros enregistrés sont ivoiriens et saisis sans indicatif
 * (`0769382758`) : depuis 2021, ils gardent leur 0 initial après `+225`.
 */
export function toWaveMobile(phone: string): string {
  const compact = phone.replace(/[\s\-.()]/g, '')
  if (compact.startsWith('+')) return compact
  if (compact.startsWith('00')) return `+${compact.slice(2)}`
  if (compact.startsWith('225') && compact.length === 13) return `+${compact}`
  return `+225${compact}`
}

/** Notification au propriétaire, à part pour s'éprouver sans FCM. */
export function buildWithdrawalPaidMessage(netAmount: number, phone: string): PushMessage {
  return {
    title: 'Retrait versé',
    body: `${netAmount.toLocaleString('fr-FR')} F ont été envoyés sur votre compte Wave ${phone}.`,
    data: { type: 'withdrawal_paid' },
  }
}

type Outcome =
  | { kind: 'payout'; payout: WavePayout }
  /** Refus certain de Wave : rien n'est parti. */
  | { kind: 'refused'; code: string; message: string }
  /** Réponse perdue ou panne : l'argent est peut-être parti. */
  | { kind: 'unknown' }

type Wallets = Pick<
  typeof Wallet,
  | 'startPayout'
  | 'recordPayoutProvider'
  | 'failPayout'
  | 'resolveWithdrawal'
  | 'claimPayoutCheck'
  | 'findProcessingWithdrawals'
  | 'findWithdrawalById'
>

/**
 * Versement automatique d'un retrait par l'API Payout de Wave.
 *
 * Déclenché par l'équipe (« Verser par Wave ») : un contrôle humain reste
 * avant que l'argent parte. La demande passe `processing` **avant** l'appel ;
 * l'issue la mène à `paid`, la ramène à `pending` sur un échec certain, ou la
 * laisse en cours quand elle est inconnue — la tâche planifiée la relit alors
 * chez Wave. Jamais de nouvel essai à l'aveugle : seule la même clé
 * d'idempotence est rejouée, et Wave ne paie jamais deux fois une même clé.
 */
export class PayOutWithdrawalUseCase {
  constructor(
    private wallets: Wallets = Wallet,
    private wave: Pick<
      WavePayoutClient,
      'isConfigured' | 'createPayout' | 'getPayout' | 'findByClientReference'
    > = new WavePayoutClient(),
    private repo: Pick<WalletRepository, 'toAdminDtos'> = new WalletRepository(),
    private notifier: Pick<NotifyUserUseCase, 'execute'> = new NotifyUserUseCase()
  ) {}

  async execute(id: string, adminId: string): Promise<AdminWithdrawalDto> {
    if (!this.wave.isConfigured()) {
      throw new DomainError(
        'payout_unavailable',
        'Le versement automatique Wave n’est pas configuré. Versez à la main, puis saisissez la référence.',
        503
      )
    }

    const started = await this.wallets.startPayout(id, adminId)
    if (!started) {
      throw new DomainError('withdrawal_not_found', 'Demande de retrait introuvable.', 404)
    }
    if (!started.changed) {
      throw new DomainError(
        'withdrawal_already_processed',
        started.request.status === 'processing'
          ? 'Un versement Wave est déjà en cours pour cette demande.'
          : 'Cette demande de retrait a déjà été traitée.',
        409
      )
    }

    await this.apply(started.request, await this.send(started.request))
    return this.reload(id)
  }

  /**
   * Relit les versements restés en cours au-delà de [PAYOUT_RECHECK_AFTER_MS].
   *
   * Identifiant Wave connu : relu directement. Sinon, cherché par sa
   * référence ; introuvable, la même requête est rejouée avec la même clé —
   * elle s'exécute si Wave ne l'a jamais reçue, et rend l'issue sinon.
   */
  async reconcile(now: Date = new Date()): Promise<{ checked: number; settled: number }> {
    if (!this.wave.isConfigured()) return { checked: 0, settled: 0 }

    const processing = await this.wallets.findProcessingWithdrawals(RECONCILE_BATCH)
    const due = processing.filter(
      (request) =>
        !request.payout_started_at ||
        now.getTime() - new Date(request.payout_started_at).getTime() >= PAYOUT_RECHECK_AFTER_MS
    )

    let settled = 0
    let checked = 0
    for (const request of due) {
      try {
        // Réservée avant d'être relue : un second passage concurrent (appel
        // manuel de la route cron, autre instance) la laisse de côté.
        const claimed = await this.wallets.claimPayoutCheck(
          request._id,
          attemptOf(request),
          now,
          PAYOUT_LEASE_MS
        )
        if (!claimed) continue
        checked++
        const outcome = await this.lookup(request)
        if (await this.apply(request, outcome)) settled++
      } catch (error) {
        // Une demande en échec n'arrête pas les autres ; elle sera relue au
        // prochain passage.
        logger.error({ err: error, withdrawal: request._id }, 'Relecture du versement impossible')
      }
    }
    return { checked, settled }
  }

  private async lookup(request: WithdrawalRequestRecord): Promise<Outcome> {
    if (request.payout_provider_id) {
      const payout = await this.wave.getPayout(request.payout_provider_id)
      if (payout) return { kind: 'payout', payout }
    }
    const [found] = await this.wave.findByClientReference(payoutKey(request))
    if (found) return { kind: 'payout', payout: found }
    return this.send(request)
  }

  /** Corps figé sur la demande : un rejeu doit être identique à l'envoi. */
  private async send(request: WithdrawalRequestRecord): Promise<Outcome> {
    const key = payoutKey(request)
    try {
      const payout = await this.wave.createPayout(
        {
          receiveAmount: request.net_amount,
          currency: 'XOF',
          mobile: toWaveMobile(request.payout_phone),
          clientReference: key,
          paymentReason: 'Retrait RESI',
        },
        key
      )
      return { kind: 'payout', payout }
    } catch (error) {
      if (!(error instanceof WaveApiError)) throw error
      // Tout ce qui n'est pas un refus certain — panne, délai, 5xx, 429,
      // `idempotency-mismatch`, code inconnu — laisse l'issue inconnue : seule
      // une relecture chez Wave tranchera.
      if (DEFINITE_REFUSALS.has(error.code)) {
        return { kind: 'refused', code: error.code, message: error.message }
      }
      // 401 et 403 : la requête est écartée à l'entrée, avant tout traitement
      // — typiquement une clé sans le droit « Payout », quel que soit le code
      // que Wave choisisse. Rien n'est parti ; l'équipe doit le savoir plutôt
      // que de voir la demande bloquée « en cours ».
      if (error.status === 401 || error.status === 403) {
        return {
          kind: 'refused',
          code: error.code,
          message: `La clé API Wave n'autorise pas le versement (${error.code}). Vérifiez le droit « Payout » de la clé dans Wave Business.`,
        }
      }
      return { kind: 'unknown' }
    }
  }

  /**
   * Reporte l'issue sur la demande. `true` si elle est close ou rouverte.
   *
   * Chaque écriture porte la tentative qu'elle conclut : une issue arrivée en
   * retard ne touche jamais une tentative plus récente.
   */
  private async apply(request: WithdrawalRequestRecord, outcome: Outcome): Promise<boolean> {
    const attempt = attemptOf(request)
    if (outcome.kind === 'unknown') {
      logger.warn({ withdrawal: request._id }, 'Versement Wave à l’issue inconnue, relu plus tard')
      return false
    }

    if (outcome.kind === 'refused') {
      return this.wallets.failPayout(request._id, attempt, {
        code: outcome.code,
        message: outcome.message,
      })
    }

    const { payout } = outcome
    if (payout.status === 'succeeded') {
      const result = await this.wallets.resolveWithdrawal(request._id, {
        status: 'paid',
        from: 'processing',
        attempt,
        processed_by: request.processed_by ?? 'wave',
        payout_reference: payout.id,
      })
      if (result?.changed) {
        await this.notifier.execute(
          request.owner_id,
          buildWithdrawalPaidMessage(request.net_amount, request.payout_phone)
        )
      }
      return Boolean(result?.changed)
    }

    if (payout.status === 'failed') {
      return this.wallets.failPayout(
        request._id,
        attempt,
        payout.payout_error ?? { code: 'payout-failed', message: 'Versement refusé par Wave' }
      )
    }

    // `processing`, ou un état que ce code ne connaît pas encore : la demande
    // reste en cours, avec l'identifiant Wave pour la relire.
    if (payout.id && payout.id !== request.payout_provider_id) {
      await this.wallets.recordPayoutProvider(request._id, attempt, payout.id)
    }
    return false
  }

  private async reload(id: string): Promise<AdminWithdrawalDto> {
    const request = await this.wallets.findWithdrawalById(id)
    if (!request) {
      throw new DomainError('withdrawal_not_found', 'Demande de retrait introuvable.', 404)
    }
    const [dto] = await this.repo.toAdminDtos([request])
    return dto
  }
}

function attemptOf(request: { payout_attempt?: number }): number {
  return request.payout_attempt ?? 1
}

export default PayOutWithdrawalUseCase
