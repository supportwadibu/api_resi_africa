import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import type { CreateExpenseInput, ExpenseDto } from '../dto/expense.dto.ts'
import { resolveExpenseTarget } from '../expense_target.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

export class CreateExpenseUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(input: CreateExpenseInput): Promise<ExpenseDto> {
    if (input.amount <= 0) {
      throw new DomainError('invalid_amount', 'Le montant doit être supérieur à zéro.', 422)
    }

    const target = resolveExpenseTarget(input)

    // La cible doit appartenir au propriétaire : sans ce contrôle, une dépense
    // pourrait être imputée au bien d'un tiers et fausser ses comptes.
    if (target.kind === 'property') {
      const property = await Property.findByIdAndOwner(target.property_id, input.owner_id)
      if (!property) {
        throw new DomainError('property_not_found', 'Bien introuvable.', 404)
      }
    } else {
      const residence = await Residence.findByIdAndOwner(target.residence_id, input.owner_id)
      if (!residence) {
        throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
      }
    }

    return this.repo.create({
      ...input,
      property_id: target.property_id,
      residence_id: target.residence_id,
    })
  }
}

export default CreateExpenseUseCase
