import logger from '@adonisjs/core/services/logger'

import {
  deliverPush,
  type PushMessage,
  type PushTransport,
} from '#features/notifications/push_delivery'
import NotificationRepository from '#features/notifications/repositories/notification_repository'
import FcmTransport from '#services/push/fcm_transport'

/**
 * Notifications du parrain : un filleul s'inscrit, un gain arrive.
 *
 * Jamais bloquant : la notification accompagne un fait déjà écrit, et son
 * échec ne doit pas faire échouer l'inscription ou la clôture qui l'a causé.
 */
export class SponsorshipNotifier {
  constructor(
    private repo: NotificationRepository = new NotificationRepository(),
    private transport: PushTransport = new FcmTransport()
  ) {}

  async sponsoredJoined(sponsorId: string, sponsoredName: string): Promise<void> {
    await this.send(sponsorId, {
      title: 'Nouveau filleul',
      body: `${firstName(sponsoredName)} s’est inscrit avec votre code. Vous gagnerez dès son premier paiement.`,
      data: { kind: 'sponsorship' },
    })
  }

  async rewardEarned(sponsorId: string, amount: number, pending: boolean): Promise<void> {
    await this.send(sponsorId, {
      title: 'Gain de parrainage',
      body: pending
        ? `${amount} F de gain de parrainage, disponibles après le délai de confirmation.`
        : `${amount} F ajoutés à vos gains de parrainage.`,
      data: { kind: 'sponsorship' },
    })
  }

  private async send(userId: string, message: PushMessage): Promise<void> {
    try {
      const targets = await this.repo.targetsForUsers([userId])
      if (targets.length === 0) return
      const delivery = await deliverPush(targets, message, this.transport)
      await this.repo.removeDevices(delivery.invalid_ids)
    } catch (error) {
      logger.warn({ err: error, user_id: userId }, 'Notification de parrainage non envoyée')
    }
  }
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export default SponsorshipNotifier
