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
    /** Acompte : bloqué jusqu'à l'arrivée, voir `ReleaseHeldDepositUseCase`. */
    held?: boolean
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

/**
 * Rend retirable l'acompte d'une réservation : à l'arrivée du client, ou à la
 * clôture d'un séjour où il ne s'est pas présenté.
 *
 * Même tolérance que le crédit : l'arrivée est acquise, et un déblocage en
 * échec se rejoue sans risque.
 */
export class ReleaseHeldDepositUseCase {
  constructor(private wallet: Pick<typeof Wallet, 'releaseHeld'> = Wallet) {}

  async execute(input: {
    owner_id: string
    residence_id: string | null
    booking_payment_id: string
  }): Promise<void> {
    try {
      await this.wallet.releaseHeld({
        wallet_id: walletIdFor(input.owner_id, input.residence_id),
        booking_payment_id: input.booking_payment_id,
      })
    } catch (error) {
      logger.error(
        { err: error, payment: input.booking_payment_id },
        'Déblocage de l’acompte impossible'
      )
    }
  }
}

/**
 * Reprend au propriétaire une commission que RESI n'a pas pu garder : voir
 * `Wallet.chargeCommission`. Propagée en cas d'échec, contrairement au
 * crédit : une commission non retenue est précisément le contournement que
 * cette reprise ferme.
 */
export class ChargeCommissionUseCase {
  constructor(private wallet: Pick<typeof Wallet, 'chargeCommission'> = Wallet) {}

  async execute(input: {
    owner_id: string
    residence_id: string | null
    booking_id: string
    booking_payment_id: string | null
    key: string
    amount: number
  }): Promise<void> {
    if (!(input.amount > 0)) return
    await this.wallet.chargeCommission({
      ...input,
      wallet_id: walletIdFor(input.owner_id, input.residence_id),
    })
  }
}

export default CreditBookingPaymentUseCase
