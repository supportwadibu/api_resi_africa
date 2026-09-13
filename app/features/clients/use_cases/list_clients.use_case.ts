import type { ListClientsInput, ListClientsOutput } from '../dto/client.dto.ts'
import ClientRepository from '../repositories/client_repository.ts'

export class ListClientsUseCase {
  constructor(private repo: ClientRepository = new ClientRepository()) {}

  async execute(input: ListClientsInput): Promise<ListClientsOutput> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const { data, total } = await this.repo.paginate(input)

    return {
      data: data.map(ClientRepository.toDto),
      meta: {
        total,
        perPage,
        currentPage: page,
        lastPage: Math.max(1, Math.ceil(total / perPage)),
      },
    }
  }
}

export default ListClientsUseCase
