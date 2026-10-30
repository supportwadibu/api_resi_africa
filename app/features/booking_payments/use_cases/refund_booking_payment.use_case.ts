import logger from '@adonisjs/core/services/logger'

import { walletIdFor } from '#features/wallets/wallet_rules'
import Wallet from '#models/wallet'
import WaveClient, { toPaymentDomainError } from '#services/wave_client'

import type { BookingPaymentDto } from '../dto/booking_payment.dto.ts'
import BookingPaymentRepository from '../repositories/booking_payment_repository.ts'
import { sponsorshipCreditOf } from '../sponsorship_credit.ts'

/**
 * Rembourse au client, par Wave, le paiement en ligne d'une réservation
 * annulée.
 *
 * Ordre délibéré : Wave d'abord, l'écriture ensuite. Si Wave refuse, rien
 * n'est écrit et l'annulation qui l'a demandé échoue avec lui — une réservation
 * annulée « remboursée » sans que l'argent soit parti serait pire qu'une
 * annulation à refaire. Rejouer est sans risque : Wave ne rembourse jamais deux
 * fois la même session, et le débit du portefeuille est lui aussi idempotent.
 */
export class RefundBookingPaymentUseCase {
  constructor(
    private paymentRepo: Pick<
      BookingPaymentRepository,
      'findSucceededByBooking' | 'updateStatus'
    > = new BookingPaymentRepository(),
    private wave: Pick<WaveClient, 'refundCheckoutSession'> = new WaveClient(),
    private wallet: Pick<typeof Wallet, 'debitRefund'> = Wallet
  ) {}

  /** Paiement en ligne encaissé de la réservation, `null` s'il n'y en a pas. */
  findPaid(bookingId: string): Promise<BookingPaymentDto | null> {
    return this.paymentRepo.findSucceededByBooking(bookingId)
  }

  /**
   * Rembourse `payment` et rend le montant rendu en argent.
   *
   * La part réglée par le crédit parrainage ne repart pas par Wave : elle est
   * débitée du portefeuille avec le reste — le propriétaire en avait été
   * crédité —, et rendue au client en crédit par l'annulation.
   */
  async execute(
    payment: BookingPaymentDto,
    booking: { id: string; owner_id: string; residence_id: string | null }
  ): Promise<number> {
    const viaWave = payment.provider !== 'sponsorship_credit'
    if (viaWave && !payment.provider_checkout_id) return 0

    if (viaWave) {
      try {
        await this.wave.refundCheckoutSession(payment.provider_checkout_id!)
      } catch (error) {
        logger.error({ err: error, payment: payment.id }, 'Remboursement Wave impossible')
        throw toPaymentDomainError(error)
      }
    }

    await this.paymentRepo.updateStatus(payment.id, 'refunded', { refunded_at: new Date() })
    await this.wallet.debitRefund({
      wallet_id: walletIdFor(booking.owner_id, booking.residence_id),
      owner_id: booking.owner_id,
      residence_id: booking.residence_id,
      booking_id: booking.id,
      booking_payment_id: payment.id,
      amount: payment.amount + sponsorshipCreditOf(payment),
    })

    return payment.amount
  }
}

export default RefundBookingPaymentUseCase
