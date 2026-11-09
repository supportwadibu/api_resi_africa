import SubscriptionRepository from '../repositories/subscription_repository.ts'
import { trialStatus, type TrialStatus } from '../trial_status.ts'

/** Où en est le propriétaire avec son essai : voir `trialStatus`. */
export class GetTrialStatusUseCase {
  constructor(private repo: SubscriptionRepository = new SubscriptionRepository()) {}

  async execute(userId: string, ownerStatus: string | null): Promise<TrialStatus> {
    return trialStatus(await this.repo.findHistoryByUser(userId), ownerStatus)
  }
}

export default GetTrialStatusUseCase
