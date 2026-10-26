import logger from '@adonisjs/core/services/logger'

import { planTierLabel, readPlanTier } from '#features/plans/plan_tier'
import Expense from '#models/expense'
import WaveClient, { isSessionPayable, toPaymentDomainError } from '#services/wave_client'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionPaymentDto } from '../dto/subscription_payment.dto.ts'
import SubscriptionPaymentRepository, {
  type SubscriptionPaymentRecord,
} from '../repositories/subscription_payment_repository.ts'
import {
  buildPaidSubscription,
  isPaymentConsistent,
  readPaymentNumber,
} from '../subscription_checkout.ts'

/** Crédit de montée porté par le paiement, `null` pour un paiement ordinaire. */
function readUpgradeCredit(metadata: Record<string, unknown> | undefined): number | null {
  return readPaymentNumber(metadata, 'upgrade_credit')
}

/**
 * Constate l'issue d'un paiement d'abonnement et ouvre l'abonnement payé.
 *
 * Appelé par le webhook Wave, par le retour du propriétaire dans
 * l'application, et avant tout nouveau paiement. Aucun de ces appels n'est
 * cru sur parole : la session est **relue chez Wave**, seule source qui fasse
 * foi. Un webhook forgé — il suffit de connaître l'identifiant de la session,
 * que le propriétaire lit dans son lien de paiement — n'ouvre donc rien.
 *
 * Idempotent : un paiement qui n'est plus `pending` est rendu tel quel.
 */
export class ConfirmSubscriptionPaymentUseCase {
  constructor(
    private paymentRepo: SubscriptionPaymentRepository = new SubscriptionPaymentRepository(),
    private wave: Pick<WaveClient, 'getCheckoutSession'> = new WaveClient()
  ) {}

  /** Confirmation demandée par le propriétaire : le paiement doit être le sien. */
  async execute(reference: string, userId: string): Promise<SubscriptionPaymentDto> {
    const payment = await this.paymentRepo.findByReference(reference)
    // Même réponse pour un paiement inconnu et pour celui d'un autre : la
    // distinguer confirmerait l'existence de la référence.
    if (!payment || payment.user_id !== userId) {
      throw new DomainError('payment_not_found', 'Paiement introuvable.', 404)
    }

    return this.confirm(payment)
  }

  /** Confirmation déclenchée par un webhook. `null` si la session n'est pas un abonnement. */
  async executeForCheckout(checkoutId: string): Promise<SubscriptionPaymentDto | null> {
    const payment = await this.paymentRepo.findByCheckoutId(checkoutId)
    return payment ? this.confirm(payment) : null
  }

  /** Confirmation par référence seule — page de retour de Wave, sans session. */
  async executeForReference(reference: string): Promise<SubscriptionPaymentDto | null> {
    const payment = await this.paymentRepo.findByReference(reference)
    return payment ? this.confirm(payment) : null
  }

  async confirm(payment: SubscriptionPaymentRecord): Promise<SubscriptionPaymentDto> {
    if (payment.status !== 'pending' || !payment.provider_checkout_id) {
      return SubscriptionPaymentRepository.toDto(payment)
    }

    const session = await this.readSession(payment.provider_checkout_id)
    // Session inconnue de Wave : rien n'a pu être payé, mais on ne clôt pas —
    // une réponse erronée de Wave ne doit pas effacer un paiement.
    if (!session) return SubscriptionPaymentRepository.toDto(payment)

    if (session.payment_status === 'succeeded') {
      if (!isPaymentConsistent(payment, session)) {
        logger.warn(
          { reference: payment._id, session: session.id },
          'Paiement Wave divergent : abonnement non ouvert'
        )
        const closed = await this.paymentRepo.closePending(payment._id, 'failed', 'amount_mismatch')
        return SubscriptionPaymentRepository.toDto(closed ?? payment)
      }

      const now = new Date()
      const result = await this.paymentRepo.activate(
        payment._id,
        (locked, current) =>
          buildPaidSubscription(
            {
              user_id: locked.user_id,
              plan_id: locked.plan_id,
              plan_tier: locked.plan_tier,
              duration_days: locked.duration_days,
              amount: locked.amount,
              transaction_reference: locked._id,
              upgrade_credit: readUpgradeCredit(locked.metadata),
              upgrade_from:
                typeof locked.metadata?.upgrade_from === 'string'
                  ? locked.metadata.upgrade_from
                  : null,
              subscription_credit: readPaymentNumber(locked.metadata, 'subscription_credit'),
              subscription_credit_declared: readPaymentNumber(
                locked.metadata,
                'subscription_credit_declared'
              ),
            },
            current,
            now
          ),
        { provider_transaction_id: session.transaction_id }
      )

      if (result?.activated) {
        await this.recordSubscriptionExpense(payment, now)
      }

      return SubscriptionPaymentRepository.toDto(result?.payment ?? payment)
    }

    // Seule une session close clôt le paiement. Une tentative refusée
    // (`payment_status: cancelled`) sur une session encore ouverte peut être
    // suivie d'une tentative réussie : la clore ici la ferait ignorer.
    if (session.checkout_status !== 'open' || !isSessionPayable(session)) {
      const closed = await this.paymentRepo.closePending(
        payment._id,
        'expired',
        session.last_payment_error?.code ?? null
      )
      return SubscriptionPaymentRepository.toDto(closed ?? payment)
    }

    // `open` / `processing` : le propriétaire n'a pas encore payé.
    return SubscriptionPaymentRepository.toDto(payment)
  }

  private async readSession(checkoutId: string) {
    try {
      return await this.wave.getCheckoutSession(checkoutId)
    } catch (error) {
      throw toPaymentDomainError(error)
    }
  }

  /**
   * Enregistre le paiement d'abonnement comme dépense du propriétaire.
   *
   * Idempotent via `createOnce` : le `client_request_id` est dérivé de la
   * référence de paiement, si bien que le webhook et le retour du
   * propriétaire, qui confirment au même instant, ne créent qu'une ligne.
   *
   * Ni `property_id` ni `residence_id` : l'abonnement est un coût
   * plateforme, non imputable à un bien ou une résidence.
   */
  private async recordSubscriptionExpense(
    payment: SubscriptionPaymentRecord,
    spentAt: Date
  ): Promise<void> {
    const tier = planTierLabel(readPlanTier(payment.plan_tier))
    // Les frais Wave sont un coût réel du propriétaire : la dépense dit ce qui
    // est sorti de son compte. Absents des paiements antérieurs : 0.
    const fee = readPaymentNumber(payment.metadata, 'wave_fee') ?? 0

    await Expense.createOnce({
      owner_id: payment.user_id,
      property_id: null,
      residence_id: null,
      category: 'subscription',
      amount: Number(payment.amount) + fee,
      spent_at: spentAt,
      note: fee > 0 ? `Abonnement ${tier} (dont ${fee} F de frais Wave)` : `Abonnement ${tier}`,
      client_request_id: `subscription:${payment._id}`,
    })
  }
}

export default ConfirmSubscriptionPaymentUseCase
