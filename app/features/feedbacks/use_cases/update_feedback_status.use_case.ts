import { DomainError } from '#utils/domain_error'

import type { AdminFeedbackDto, UpdateFeedbackStatusInput } from '../dto/feedback.dto.ts'
import FeedbackRepository from '../repositories/feedback_repository.ts'

export class UpdateFeedbackStatusUseCase {
  constructor(private repo: FeedbackRepository = new FeedbackRepository()) {}

  async execute(id: string, input: UpdateFeedbackStatusInput): Promise<AdminFeedbackDto> {
    const doc = await this.repo.updateStatus(id, input)
    if (!doc) {
      throw new DomainError('feedback_not_found', 'Avis introuvable.', 404)
    }

    return FeedbackRepository.toAdminDto(doc)
  }
}

export default UpdateFeedbackStatusUseCase
