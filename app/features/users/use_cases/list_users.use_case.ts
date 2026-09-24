import { buildPaginationMeta } from '#features/feedbacks/use_cases/pagination'

import type { ListUsersInput, ListUsersOutput } from '../dto/user.dto.ts'
import UserRepository from '../repositories/user_repository.ts'

/** Comptes de la plateforme, tous rôles confondus. */
export class ListUsersUseCase {
  constructor(private repo: UserRepository = new UserRepository()) {}

  async execute(input: ListUsersInput): Promise<ListUsersOutput> {
    const { data, total } = await this.repo.paginate(input)
    return { data, meta: buildPaginationMeta(total, input) }
  }
}

export default ListUsersUseCase
