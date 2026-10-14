import { DomainError } from '#utils/domain_error'

import ExpenseRepository from '../repositories/expense_repository.ts'

export class DeleteExpenseUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(id: string, owner_id: string): Promise<void> {
    const deleted = await this.repo.delete(id, owner_id)
    if (!deleted) {
      throw new DomainError('expense_not_found', 'Dépense introuvable.', 404)
    }
  }
}

export default DeleteExpenseUseCase
