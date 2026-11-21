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
    for (const request of due) {
      try {
        const outcome = await this.lookup(request)
        if (await this.apply(request, outcome)) settled++
      } catch (error) {
        // Une demande en échec n'arrête pas les autres ; elle sera relue au
        // prochain passage.
        logger.error({ err: error, withdrawal: request._id }, 'Relecture du versement impossible')
      }
    }
    return { checked: due.length, settled }
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
      // Panne, délai, 5xx, 429 : la requête a pu aboutir. Une clé reprise avec
      // un autre corps (`idempotency-mismatch`) ne dit rien non plus de
      // l'argent : seule une relecture tranchera.
      if (error.isTransient || error.code === 'idempotency-mismatch') return { kind: 'unknown' }
      return { kind: 'refused', code: error.code, message: error.message }
    }
  }

  /** Reporte l'issue sur la demande. `true` si elle est close ou rouverte. */
  private async apply(request: WithdrawalRequestRecord, outcome: Outcome): Promise<boolean> {
    if (outcome.kind === 'unknown') {
      logger.warn({ withdrawal: request._id }, 'Versement Wave à l’issue inconnue, relu plus tard')
      return false
    }

    if (outcome.kind === 'refused') {
      return this.wallets.failPayout(request._id, { code: outcome.code, message: outcome.message })
    }

    const { payout } = outcome
    if (payout.status === 'succeeded') {
      const result = await this.wallets.resolveWithdrawal(request._id, {
        status: 'paid',
        from: 'processing',
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
        payout.payout_error ?? { code: 'payout-failed', message: 'Versement refusé par Wave' }
      )
    }

    // `processing`, ou un état que ce code ne connaît pas encore : la demande
    // reste en cours, avec l'identifiant Wave pour la relire.
    if (payout.id && payout.id !== request.payout_provider_id) {
      await this.wallets.recordPayoutProvider(request._id, payout.id)
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

export default PayOutWithdrawalUseCase
