import logger from '@adonisjs/core/services/logger'

import WaveSubscriptionService from '#services/wave_subscription_service'
import { DomainError } from '#utils/domain_error'

import type { SubscriptionPaymentDto } from '../dto/subscription_payment.dto.ts'
import SubscriptionPaymentRepository, {
  type SubscriptionPaymentRecord,
} from '../repositories/subscription_payment_repository.ts'
import { buildPaidSubscription, isPaymentConsistent } from '../subscription_checkout.ts'

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
    private wave: WaveSubscriptionService = new WaveSubscriptionService()
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
            },
            current,
            now
          ),
        { provider_transaction_id: session.transaction_id }
      )
      return SubscriptionPaymentRepository.toDto(result?.payment ?? payment)
    }

    if (session.checkout_status === 'expired' || session.payment_status === 'cancelled') {
      const closed = await this.paymentRepo.closePending(payment._id, 'expired', null)
      return SubscriptionPaymentRepository.toDto(closed ?? payment)
    }

    // `open` / `processing` : le propriétaire n'a pas encore payé.
    return SubscriptionPaymentRepository.toDto(payment)
  }

  private async readSession(checkoutId: string) {
    try {
      return await this.wave.getCheckoutSession(checkoutId)
    } catch (error) {
      logger.error({ err: error, checkoutId }, 'Lecture de la session Wave impossible')
      throw new DomainError(
        'payment_provider_unavailable',
        'Wave est momentanément injoignable. Réessayez dans un instant.',
        502
      )
    }
  }
}

export default ConfirmSubscriptionPaymentUseCase
