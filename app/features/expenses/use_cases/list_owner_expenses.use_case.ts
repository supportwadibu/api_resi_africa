import type { ListExpensesFilters, ListExpensesOutput } from '../dto/expense.dto.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

export class ListOwnerExpensesUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(
    owner_id: string,
    filters: Omit<ListExpensesFilters, 'owner_id'> = {}
  ): Promise<ListExpensesOutput> {
    const { data, total, page, perPage } = await this.repo.paginate({
      ...filters,
      owner_id,
    })

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

export default ListOwnerExpensesUseCase
