import { DomainError } from '#utils/domain_error'

import type { AdminFeedbackDto } from '../dto/feedback.dto.ts'
import FeedbackRepository from '../repositories/feedback_repository.ts'

export class GetFeedbackUseCase {
  constructor(private repo: FeedbackRepository = new FeedbackRepository()) {}

  async execute(id: string): Promise<AdminFeedbackDto> {
    const doc = await this.repo.findById(id)
    if (!doc) {
      throw new DomainError('feedback_not_found', 'Avis introuvable.', 404)
    }

    return FeedbackRepository.toAdminDto(doc)
  }
}

export default GetFeedbackUseCase
