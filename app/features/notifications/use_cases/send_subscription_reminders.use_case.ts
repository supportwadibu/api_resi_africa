import logger from '@adonisjs/core/services/logger'

import FcmTransport from '#services/push/fcm_transport'

import type { SubscriptionRemindersResult } from '../dto/notification.dto.ts'
import { deliverPush, type PushTransport } from '../push_delivery.ts'
import NotificationRepository from '../repositories/notification_repository.ts'
import {
  buildReminderMessage,
  reminderDispatchId,
  reminderStage,
  reminderWindow,
} from '../subscription_reminder.ts'

/**
 * Relance les propriétaires dont l'abonnement arrive à échéance : J-7, J-3 et
 * le jour même.
 *
 * Appelé par l'ordonnanceur externe (`/cron/subscription-reminders`), autant
 * de fois qu'il veut : chaque étape est réservée par une trace créée avant
 * l'envoi, et une étape déjà réservée ne repart pas.
 *
 * Réserver **avant** d'envoyer, et non après : au pire une relance se perd sur
 * une panne FCM, jamais elle ne part deux fois. Un propriétaire relancé deux
 * fois le même jour pour la même échéance croirait à une erreur ; une relance
 * manquée est rattrapée par l'étape suivante.
 */
export class SendSubscriptionRemindersUseCase {
  constructor(
    private repo: NotificationRepository = new NotificationRepository(),
    private transport: PushTransport = new FcmTransport()
  ) {}

  async execute(now: Date = new Date()): Promise<SubscriptionRemindersResult> {
    const window = reminderWindow(now)
    const subscriptions = await this.repo.subscriptionsEndingBetween(window.from, window.to)

    const result: SubscriptionRemindersResult = {
      examined: subscriptions.length,
      reminders_sent: 0,
      already_sent: 0,
      devices_sent: 0,
      devices_failed: 0,
    }

    for (const subscription of subscriptions) {
      const stage = reminderStage(subscription.end_date, now)
      if (stage === null) continue

      const claimed = await this.repo.claimDispatch(
        reminderDispatchId(subscription._id, stage, subscription.end_date),
        { user_id: subscription.user_id, kind: 'subscription_expiry' }
      )
      if (!claimed) {
        result.already_sent++
        continue
      }

      const targets = await this.repo.targetsForUsers([subscription.user_id])
      const message = buildReminderMessage(
        {
          id: subscription._id,
          is_trial: subscription.is_trial,
          end_date: subscription.end_date,
        },
        now
      )

      try {
        const delivery = await deliverPush(targets, message, this.transport)
        await this.repo.removeDevices(delivery.invalid_ids)

        result.reminders_sent++
        result.devices_sent += delivery.sent
        result.devices_failed += delivery.failed
      } catch (error) {
        // Un propriétaire en échec ne doit pas priver les suivants de leur
        // relance : l'erreur est tracée, la boucle continue.
        logger.error({ err: error, subscription_id: subscription._id }, 'Relance non envoyée')
      }
    }

    return result
  }
}

export default SendSubscriptionRemindersUseCase
