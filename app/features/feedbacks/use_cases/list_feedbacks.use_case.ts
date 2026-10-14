import type { ListFeedbacksInput, ListFeedbacksOutput } from '../dto/feedback.dto.ts'
import FeedbackRepository from '../repositories/feedback_repository.ts'
import { buildPaginationMeta } from './pagination.ts'

/** Liste destinée à l'équipe : auteur et contexte technique inclus. */
export class ListFeedbacksUseCase {
  constructor(private repo: FeedbackRepository = new FeedbackRepository()) {}

  async execute(input: ListFeedbacksInput): Promise<ListFeedbacksOutput> {
    const { data, total } = await this.repo.paginate(input)

    return {
      data: data.map(FeedbackRepository.toAdminDto),
      meta: buildPaginationMeta(total, input),
    }
  }
}

export default ListFeedbacksUseCase
