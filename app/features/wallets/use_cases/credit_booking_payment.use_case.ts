import logger from '@adonisjs/core/services/logger'
import Wallet from '#models/wallet'

import { walletIdFor } from '../wallet_rules.ts'

/**
 * Crédite le portefeuille de la résidence d'un paiement en ligne réussi.
 *
 * Appelé à la confirmation du paiement, quelle qu'en soit la voie — webhook,
 * page de retour, retour du client dans l'app : le crédit est idempotent.
 *
 * Un échec est journalisé et non propagé : le paiement est acquis et la
 * réservation confirmée, et le client n'a pas à voir une erreur pour un
 * crédit que l'équipe peut rejouer.
 */
export class CreditBookingPaymentUseCase {
  async execute(input: {
    owner_id: string
    residence_id: string | null
    booking_id: string
    booking_payment_id: string
    amount: number
  }): Promise<void> {
    if (!(input.amount > 0)) return
    try {
      await Wallet.creditPayment({
        ...input,
        wallet_id: walletIdFor(input.owner_id, input.residence_id),
      })
    } catch (error) {
      logger.error(
        { err: error, payment: input.booking_payment_id },
        'Crédit du portefeuille impossible'
      )
    }
  }
}

export default CreditBookingPaymentUseCase
