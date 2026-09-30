import DeviceToken, { type DeviceTokenDocument } from '#models/device_token'
import NotificationCampaign, {
  NotificationDispatch,
  type NotificationCampaignDocument,
  type NotificationCampaignRecord,
} from '#models/notification_campaign'
import Subscription from '#models/subscription'

import type { NotificationCampaignDto } from '../dto/notification.dto.ts'
import type { PushTarget } from '../push_delivery.ts'

/** Appareil ciblé, avec le compte auquel il appartient. */
export interface UserPushTarget extends PushTarget {
  role: string
  user_id: string
}

export class NotificationRepository {
  static toCampaignDto(doc: NotificationCampaignRecord): NotificationCampaignDto {
    return {
      id: doc._id,
      title: doc.title,
      body: doc.body,
      audience: doc.audience,
      owner_ids: doc.owner_ids ?? [],
      recipients_count: doc.recipients_count ?? 0,
      devices_sent: doc.devices_sent ?? 0,
      devices_failed: doc.devices_failed ?? 0,
      created_by: doc.created_by,
      created_at: doc.created_at,
    }
  }

  async registerDevice(input: Omit<DeviceTokenDocument, 'created_at' | 'updated_at'>) {
    await DeviceToken.upsert(input)
  }

  async unregisterDevice(token: string, userId: string) {
    await DeviceToken.removeForUser(token, userId)
  }

  async removeDevices(ids: readonly string[]) {
    await DeviceToken.removeByIds(ids)
  }

  async targetsForUsers(userIds: readonly string[]): Promise<UserPushTarget[]> {
    const records = await DeviceToken.findByUsers(userIds)
    return records.map((r) => ({ id: r._id, token: r.token, user_id: r.user_id, role: r.role }))
  }

  async targetsForRole(role: string): Promise<UserPushTarget[]> {
    const records = await DeviceToken.findByRole(role)
    return records.map((r) => ({ id: r._id, token: r.token, user_id: r.user_id, role: r.role }))
  }

  async subscriptionsEndingBetween(from: Date, to: Date) {
    return Subscription.findEndingBetween(from, to)
  }

  async claimDispatch(id: string, data: { user_id: string; kind: string }) {
    return NotificationDispatch.claim(id, data)
  }

  async recordCampaign(input: NotificationCampaignDocument): Promise<NotificationCampaignDto> {
    return NotificationRepository.toCampaignDto(await NotificationCampaign.create(input))
  }

  async paginateCampaigns(page: number, perPage: number) {
    const { data, total } = await NotificationCampaign.paginate({
      limit: perPage,
      offset: (page - 1) * perPage,
    })
    return {
      data: data.map(NotificationRepository.toCampaignDto),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default NotificationRepository
