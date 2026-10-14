import NotificationRepository from '../repositories/notification_repository.ts'

/** Historique des notifications envoyées depuis le back-office, la plus récente d'abord. */
export class ListNotificationCampaignsUseCase {
  constructor(private repo: NotificationRepository = new NotificationRepository()) {}

  async execute(input: { page?: number; per_page?: number }) {
    return this.repo.paginateCampaigns(input.page ?? 1, input.per_page ?? 20)
  }
}

export default ListNotificationCampaignsUseCase
