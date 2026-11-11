import logger from '@adonisjs/core/services/logger'

import BookingPaymentRepository from '#features/booking_payments/repositories/booking_payment_repository'
import Sponsorship from '#models/sponsorship'

import SponsorshipRepository from '../repositories/sponsorship_repository.ts'
import SponsorshipNotifier from '../sponsorship_notifier.ts'
import { computeReward, rewardAvailableAt } from '../sponsorship_rules.ts'
import { commissionOfPayment } from '#features/booking_payments/sponsorship_credit'
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
 * Attribue au parrain un gain à **chaque** action qui rapporte de son
 * filleul : chaque séjour en ligne payé et terminé, chaque abonnement payé.
 *
 * Appelé à la clôture d'un séjour — par le propriétaire ou par la tâche
 * planifiée — et à l'activation d'un abonnement payé. Jamais bloquant : un
 * échec est journalisé, la clôture ou l'abonnement restent acquis. Idempotent :
 * un gain par déclencheur, sous une clé qui en dérive (`Sponsorship.addReward`).
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
      if (!sponsorship || sponsorship.status === 'cancelled') return
      // Le parrain qui loge son propre filleul encaisserait le séjour et le
      // gain : l'argent ferait un aller-retour par son portefeuille.
      if (sponsorship.sponsor_id === booking.owner_id) return

      await this.qualify(booking.client_id, {
        trigger: 'booking_completed',
        trigger_ref_id: booking.id,
        // Le gain d'un parrain client se calcule sur la commission de RESI,
        // et non sur le prix du séjour : c'est RESI qui le paie, sur ce
        // qu'elle a gagné. Sans commission — historique, commission coupée —,
        // RESI n'a rien gagné et le parrain non plus.
        paid_amount: commissionOfPayment(payment),
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
      if (!sponsorship || sponsorship.status === 'cancelled') return

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
      await Sponsorship.cancelPendingRewards(userId, {
        trigger: 'subscription_paid',
        reason: 'Abonnement du filleul remboursé',
        now,
      })
      // Gain unique de l'ancien parrainage, encore en attente.
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
    // Gains coupés : cette action ne rapporte rien ; les suivantes rapporteront
    // après la réouverture.
    if (!settings.enabled) return

    const sponsorship = await Sponsorship.findBySponsored(sponsoredId)
    if (!sponsorship) return

    const rule = settings.rewards[sponsorship.sponsored_role]
    const reward = computeReward(rule, input.paid_amount)
    if (reward <= 0) return

    const availableAt = rewardAvailableAt(input.now, rule.hold_days)
    const qualified = await Sponsorship.addReward(sponsoredId, {
      reward,
      rule,
      trigger: input.trigger,
      trigger_ref_id: input.trigger_ref_id,
      trigger_amount: input.paid_amount,
      available_at: availableAt,
      now: input.now,
    })

    if (qualified) {
      await this.notifier.rewardEarned(qualified.sponsor_id, reward, qualified.pending)
    }
  }
}

export default QualifySponsorshipUseCase
