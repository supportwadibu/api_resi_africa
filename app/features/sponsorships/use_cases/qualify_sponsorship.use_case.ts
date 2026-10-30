import logger from '@adonisjs/core/services/logger'

import BookingPaymentRepository from '#features/booking_payments/repositories/booking_payment_repository'
import Sponsorship from '#models/sponsorship'

import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import SponsorshipNotifier from '../sponsorship_notifier.ts'
import { computeReward, rewardAvailableAt } from '../sponsorship_rules.ts'
import RestoreStayCreditUseCase from './restore_stay_credit.use_case.ts'

/** Ce que la qualification lit d'une réservation terminée. */
export interface CompletedBooking {
  id: string
  client_id: string
  owner_id: string
  source?: 'online' | 'offline'
  total_amount: number
  sponsorship_credit_amount?: number
}

/**
 * Attribue au parrain le gain de la première action qui rapporte de son
 * filleul.
 *
 * Appelé à la clôture d'un séjour — par le propriétaire ou par la tâche
 * planifiée — et à l'activation d'un abonnement payé. Jamais bloquant : un
 * échec est journalisé, la clôture ou l'abonnement restent acquis. Idempotent :
 * un parrainage déjà qualifié n'est plus `registered`, `Sponsorship.qualify`
 * ne le touche plus.
 */
export class QualifySponsorshipUseCase {
  constructor(
    private repo: SponsorshipRepository = new SponsorshipRepository(),
    private payments: Pick<
      BookingPaymentRepository,
      'findSucceededByBooking'
    > = new BookingPaymentRepository(),
    private notifier: SponsorshipNotifier = new SponsorshipNotifier(),
    private stayCredit: RestoreStayCreditUseCase = new RestoreStayCreditUseCase()
  ) {}

  /**
   * Séjour terminé. Ne compte qu'une réservation **en ligne et payée** : une
   * réservation comptoir est réglée en espèces au propriétaire, RESI n'en voit
   * pas l'argent, et un propriétaire pourrait en saisir de fausses pour ses
   * propres filleuls.
   */
  async onBookingCompleted(booking: CompletedBooking, now: Date = new Date()): Promise<void> {
    try {
      if (booking.source === 'offline') return

      const payment = await this.payments.findSucceededByBooking(booking.id)
      if (!payment) {
        // Séjour mené à terme sans paiement en ligne : le crédit séjour engagé
        // n'a payé personne, il revient au client.
        await this.stayCredit.execute(booking, now)
        return
      }

      const sponsorship = await Sponsorship.findBySponsored(booking.client_id)
      if (!sponsorship || sponsorship.status !== 'registered') return
      // Le parrain qui loge son propre filleul encaisserait le séjour et le
      // gain : l'argent ferait un aller-retour par son portefeuille.
      if (sponsorship.sponsor_id === booking.owner_id) return

      await this.qualify(booking.client_id, {
        trigger: 'booking_completed',
        trigger_ref_id: booking.id,
        // Prix du séjour, crédit parrainage compris : le propriétaire en a
        // été crédité en entier.
        paid_amount: booking.total_amount,
        now,
      })
    } catch (error) {
      logger.error({ err: error, booking_id: booking.id }, 'Qualification de parrainage en échec')
    }
  }

  /** Abonnement payé. L'essai gratuit n'en passe jamais par ici. */
  async onSubscriptionPaid(
    input: { user_id: string; payment_reference: string; amount: number },
    now: Date = new Date()
  ): Promise<void> {
    try {
      const sponsorship = await Sponsorship.findBySponsored(input.user_id)
      if (!sponsorship || sponsorship.status !== 'registered') return

      await this.qualify(input.user_id, {
        trigger: 'subscription_paid',
        trigger_ref_id: input.payment_reference,
        paid_amount: input.amount,
        now,
      })
    } catch (error) {
      logger.error({ err: error, user_id: input.user_id }, 'Qualification de parrainage en échec')
    }
  }

  /**
   * Abonnement résilié avec remboursement : le gain encore en attente qu'il
   * avait déclenché est annulé. Un gain déjà disponible reste acquis — le
   * délai d'attente est là pour couvrir ce cas.
   */
  async onSubscriptionRefunded(userId: string, now: Date = new Date()): Promise<void> {
    try {
      const sponsorship = await Sponsorship.findBySponsored(userId)
      if (sponsorship?.status !== 'pending' || sponsorship.trigger !== 'subscription_paid') return
      await Sponsorship.cancel(userId, {
        reason: 'Abonnement du filleul remboursé',
        cancelled_by: null,
        now,
        only_pending: true,
      })
    } catch (error) {
      logger.error({ err: error, user_id: userId }, 'Annulation de gain de parrainage en échec')
    }
  }

  private async qualify(
    sponsoredId: string,
    input: {
      trigger: 'booking_completed' | 'subscription_paid'
      trigger_ref_id: string
      paid_amount: number
      now: Date
    }
  ): Promise<void> {
    const settings = await this.repo.settings()
    // Gains coupés : le parrainage reste `registered`, et la prochaine action
    // qualifiante après la réouverture rapportera.
    if (!settings.enabled) return

    const sponsorship = await Sponsorship.findBySponsored(sponsoredId)
    if (!sponsorship) return

    const rule = settings.rewards[sponsorship.sponsored_role]
    const reward = computeReward(rule, input.paid_amount)
    if (reward <= 0) return

    const availableAt = rewardAvailableAt(input.now, rule.hold_days)
    const qualified = await Sponsorship.qualify(sponsoredId, {
      reward,
      rule,
      trigger: input.trigger,
      trigger_ref_id: input.trigger_ref_id,
      trigger_amount: input.paid_amount,
      available_at: availableAt,
      now: input.now,
    })

    if (qualified) {
      await this.notifier.rewardEarned(qualified.sponsor_id, reward, qualified.status === 'pending')
    }
  }
}

export default QualifySponsorshipUseCase
