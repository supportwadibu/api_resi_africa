import { DomainError } from '#utils/domain_error'

import type { ExpenseDto } from '../dto/expense.dto.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

export class FindExpenseUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(id: string, owner_id: string): Promise<ExpenseDto> {
    const expense = await this.repo.findByIdAndOwner(id, owner_id)
    if (!expense) {
      throw new DomainError('expense_not_found', 'Dépense introuvable.', 404)
    }
    return expense
  }
}

export default FindExpenseUseCase
