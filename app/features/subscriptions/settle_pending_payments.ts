import WaveClient, { toPaymentDomainError } from '#services/wave_client'
import { DomainError } from '#utils/domain_error'

import SubscriptionPaymentRepository from './repositories/subscription_payment_repository.ts'
import ConfirmSubscriptionPaymentUseCase from './use_cases/confirm_subscription_payment.use_case.ts'

/**
 * Solde les paiements d'abonnement restés en attente.
 *
 * Un paiement déjà réglé chez Wave mais pas encore confirmé est d'abord
 * constaté : le propriétaire a payé, et l'ignorer le ferait payer deux fois.
 * Les autres sessions sont fermées chez Wave, pour qu'un vieux lien ne puisse
 * plus être payé.
 *
 * Partagé par le lancement d'un paiement et par la résiliation. Pour celle-ci,
 * une session restée payable serait une faille : une montée chiffrée avec le
 * crédit des jours restants, payée après que ces mêmes jours ont été
 * remboursés, ferait toucher le crédit deux fois.
 */
export class PendingPaymentSettler {
  constructor(
    private paymentRepo: SubscriptionPaymentRepository = new SubscriptionPaymentRepository(),
    private wave: Pick<WaveClient, 'expireCheckoutSession'> = new WaveClient(),
    private confirmation: ConfirmSubscriptionPaymentUseCase = new ConfirmSubscriptionPaymentUseCase()
  ) {}

  /**
   * `strict` : refuse si une session n'a pas pu être fermée, au lieu de la
   * laisser ouverte — exigé avant de rembourser.
   */
  async settle(userId: string, options: { strict?: boolean } = {}): Promise<void> {
    for (const pending of await this.paymentRepo.findPendingByUser(userId)) {
      const settled = await this.confirmation.confirm(pending)
      if (settled.status === 'success') {
        throw new DomainError(
          'subscription_payment_received',
          'Votre paiement précédent vient d’être confirmé : votre abonnement est actif.',
          409
        )
      }
      if (settled.status !== 'pending' || !pending.provider_checkout_id) continue

      let expired = false
      try {
        expired = await this.wave.expireCheckoutSession(pending.provider_checkout_id)
      } catch (error) {
        throw toPaymentDomainError(error)
      }
      if (expired) {
        await this.paymentRepo.closePending(pending._id, 'expired', 'superseded')
      } else if (options.strict) {
        throw new DomainError(
          'payment_in_progress',
          'Un paiement Wave est en cours. Finalisez-le ou attendez quelques minutes avant de résilier.',
          409
        )
      }
    }
  }
}

export default PendingPaymentSettler
