import logger from '@adonisjs/core/services/logger'

import FcmTransport from '#services/push/fcm_transport'

import { deliverPush, type PushMessage, type PushTransport } from '../push_delivery.ts'
import NotificationRepository from '../repositories/notification_repository.ts'

/**
 * Notification push à un compte, sur tous ses appareils.
 *
 * Ne lève jamais : elle accompagne une action déjà accomplie (validation d'un
 * compte…), et une panne FCM ne doit pas faire croire à l'admin que l'action
 * a échoué. L'échec est tracé et l'appelant reçoit `false`.
 */
export class NotifyUserUseCase {
  constructor(
    private repo: NotificationRepository = new NotificationRepository(),
    private transport: PushTransport = new FcmTransport()
  ) {}

  async execute(userId: string, message: PushMessage): Promise<boolean> {
    try {
      const targets = await this.repo.targetsForUsers([userId])
      if (targets.length === 0) return false

      const delivery = await deliverPush(targets, message, this.transport)
      await this.repo.removeDevices(delivery.invalid_ids)
      return delivery.sent > 0
    } catch (error) {
      logger.error({ err: error, user_id: userId }, 'Notification push non envoyée')
      return false
    }
  }
}

export default NotifyUserUseCase
