import Expense from '#models/expense'
import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import type { ExpenseDto, UpdateExpenseInput } from '../dto/expense.dto.ts'
import { resolveExpenseTarget } from '../expense_target.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

export class UpdateExpenseUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(id: string, input: UpdateExpenseInput, owner_id: string): Promise<ExpenseDto> {
    if (input.amount !== undefined && input.amount <= 0) {
      throw new DomainError('invalid_amount', 'Le montant doit être supérieur à zéro.', 422)
    }

    const current = await Expense.findByIdAndOwner(id, owner_id)
    if (!current) {
      throw new DomainError('expense_not_found', 'Dépense introuvable.', 404)
    }

    const patch: UpdateExpenseInput = { ...input }

    // Le rattachement est validé sur son état *résultant*, et non sur le seul
    // patch : basculer une charge de bien vers une résidence suppose d'effacer
    // `property_id` dans le même mouvement, sans quoi les deux coexisteraient
    // et la dépense serait comptée deux fois.
    const touchesTarget = input.property_id !== undefined || input.residence_id !== undefined
    if (touchesTarget) {
      const target = resolveExpenseTarget({
        property_id: input.property_id !== undefined ? input.property_id : current.property_id,
        residence_id: input.residence_id !== undefined ? input.residence_id : current.residence_id,
      })

      // Réimputer n'est permis que vers une cible du même propriétaire.
      if (target.kind === 'property') {
        const property = await Property.findByIdAndOwner(target.property_id, owner_id)
        if (!property) {
          throw new DomainError('property_not_found', 'Bien introuvable.', 404)
        }
      } else {
        const residence = await Residence.findByIdAndOwner(target.residence_id, owner_id)
        if (!residence) {
          throw new DomainError('residence_not_found', 'Résidence introuvable.', 404)
        }
      }

      patch.property_id = target.property_id
      patch.residence_id = target.residence_id
    }

    const updated = await this.repo.update(id, patch, owner_id)
    if (!updated) {
      throw new DomainError('expense_not_found', 'Dépense introuvable.', 404)
    }
    return updated
  }
}

export default UpdateExpenseUseCase
