import logger from '@adonisjs/core/services/logger'

import Sponsorship from '#models/sponsorship'

/**
 * Rend au client le crédit séjour engagé sur une réservation qui n'aura pas
 * lieu — annulée, ou close sans paiement.
 *
 * Jamais bloquant : l'annulation est acquise, et un crédit qui ne revient pas
 * se rejoue à la main sans rien perdre — la ligne du journal porte
 * l'identifiant de la réservation, le rendre deux fois est impossible.
 */
export class RestoreStayCreditUseCase {
  async execute(
    booking: { id: string; client_id: string; sponsorship_credit_amount?: number },
    now: Date = new Date()
  ): Promise<void> {
    const amount = booking.sponsorship_credit_amount ?? 0
    if (amount <= 0) return

    try {
      await Sponsorship.restoreStayCredit({
        booking_id: booking.id,
        client_id: booking.client_id,
        amount,
        now,
      })
    } catch (error) {
      logger.error({ err: error, booking_id: booking.id }, 'Crédit séjour non rendu')
    }
  }
}

export default RestoreStayCreditUseCase
