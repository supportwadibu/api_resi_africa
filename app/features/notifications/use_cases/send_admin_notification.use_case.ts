import FcmTransport from '#services/push/fcm_transport'
import { DomainError } from '#utils/domain_error'

import type {
  NotificationCampaignDto,
  SendAdminNotificationInput,
} from '../dto/notification.dto.ts'
import { deliverPush, type PushTransport } from '../push_delivery.ts'
import NotificationRepository from '../repositories/notification_repository.ts'

/** Rôle ciblé par les envois du back-office. */
const OWNER_ROLE = 'proprio'

/**
 * Notification envoyée depuis le back-office : groupée à tous les
 * propriétaires, ou ciblée sur ceux que l'administrateur a choisis.
 *
 * L'envoi est tracé même quand aucun appareil n'est joignable : le
 * back-office doit pouvoir dire « envoyée à 0 appareil » plutôt que laisser
 * croire qu'elle est partie.
 */
export class SendAdminNotificationUseCase {
  constructor(
    private repo: NotificationRepository = new NotificationRepository(),
    private transport: PushTransport = new FcmTransport()
  ) {}

  async execute(input: SendAdminNotificationInput): Promise<NotificationCampaignDto> {
    const ownerIds = [...new Set(input.owner_ids ?? [])]

    if (input.audience === 'selected_owners' && ownerIds.length === 0) {
      throw new DomainError(
        'notification_no_recipient',
        'Choisissez au moins un propriétaire.',
        422
      )
    }

    // Ciblée, les appareils sont relus par compte **et** filtrés sur le rôle :
    // un identifiant de client glissé dans la sélection ne doit rien recevoir.
    const candidates =
      input.audience === 'all_owners'
        ? await this.repo.targetsForRole(OWNER_ROLE)
        : await this.repo.targetsForUsers(ownerIds)
    const targets = candidates.filter((target) => target.role === OWNER_ROLE)

    const delivery = await deliverPush(
      targets,
      {
        title: input.title,
        body: input.body,
        data: { type: 'admin_message' },
      },
      this.transport
    )
    await this.repo.removeDevices(delivery.invalid_ids)

    return this.repo.recordCampaign({
      title: input.title,
      body: input.body,
      audience: input.audience,
      owner_ids: input.audience === 'selected_owners' ? ownerIds : [],
      recipients_count: new Set(targets.map((t) => t.user_id)).size,
      devices_sent: delivery.sent,
      devices_failed: delivery.failed,
      created_by: input.created_by,
      created_at: new Date(),
    })
  }
}

export default SendAdminNotificationUseCase
