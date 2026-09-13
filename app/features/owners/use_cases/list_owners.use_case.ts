/* eslint-disable prettier/prettier */
import type {
  ListOwnersInput,
  ListOwnersOutput,
} from '../dto/owner.dto.ts'
import OwnerRepository from '../repositories/owner_repository.ts'

/**
 * Liste paginée des owners avec filtre optionnel sur owner_status.
 * Spécialisation : `ListPendingOwnersUseCase` fixe status='pending'.
 */
export class ListOwnersUseCase {
  constructor(private repo: OwnerRepository = new OwnerRepository()) {}

  async execute(input: ListOwnersInput): Promise<ListOwnersOutput> {
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

export class ListPendingOwnersUseCase {
  constructor(private inner: ListOwnersUseCase = new ListOwnersUseCase()) {}

  async execute(input: Omit<ListOwnersInput, 'status'>): Promise<ListOwnersOutput> {
    return this.inner.execute({ ...input, status: 'pending' })
  }
}

export default ListOwnersUseCase
