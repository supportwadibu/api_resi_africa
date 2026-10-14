/* eslint-disable prettier/prettier */
import type {
  ListSubscriptionsInput,
  ListSubscriptionsOutput,
} from '../dto/subscription.dto.ts'
import SubscriptionRepository from '../repositories/subscription_repository.ts'

/**
 * Liste paginée des souscriptions (admin) avec filtres status/is_trial/user.
 */
export class ListSubscriptionsUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(input: ListSubscriptionsInput): Promise<ListSubscriptionsOutput> {
    const { data, total, page, perPage } = await this.repo.paginate(input)
    return {
      data,
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
