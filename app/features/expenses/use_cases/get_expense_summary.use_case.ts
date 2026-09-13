import type { ExpenseSummaryDto, ListExpensesFilters } from '../dto/expense.dto.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

export class GetExpenseSummaryUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(
    owner_id: string,
    filters: Omit<ListExpensesFilters, 'owner_id'> = {}
  ): Promise<ExpenseSummaryDto> {
    return this.repo.summary({ ...filters, owner_id })
  }
}

export default GetExpenseSummaryUseCase
