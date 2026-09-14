import type { ListFeedbacksInput, ListMyFeedbacksOutput } from '../dto/feedback.dto.ts'
import FeedbackRepository from '../repositories/feedback_repository.ts'
import { buildPaginationMeta } from './pagination.ts'

/** Historique de ses propres envois — sans l'auteur ni la note interne. */
export class ListMyFeedbacksUseCase {
  constructor(private repo: FeedbackRepository = new FeedbackRepository()) {}

  async execute(input: ListFeedbacksInput & { user_id: string }): Promise<ListMyFeedbacksOutput> {
    const { data, total } = await this.repo.paginate(input)

    return {
      data: data.map(FeedbackRepository.toDto),
      meta: buildPaginationMeta(total, input),
    }
  }
}

export default ListMyFeedbacksUseCase
