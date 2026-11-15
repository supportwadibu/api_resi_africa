import UserRepository from '#features/users/repositories/user_repository'

import type { ListSubscriptionsInput, ListSubscriptionsOutput } from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Liste paginée des souscriptions (admin) avec filtres status/is_trial/user,
 * chacune avec son propriétaire : l'abonnement n'en porte que l'identifiant.
 */
export class ListSubscriptionsUseCase {
  constructor(
    private repo: SubscriptionRepository = new SubscriptionRepository(),
    private users: UserRepository = new UserRepository()
  ) {}

  async execute(input: ListSubscriptionsInput): Promise<ListSubscriptionsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate(input)
    const owners = await this.users.findSummaries(data.map((s) => s.user_id))
    return {
      data: data.map((subscription) => ({
        ...subscription,
        owner: owners.get(subscription.user_id) ?? null,
      })),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListSubscriptionsUseCase
