import Property from '#models/property'
import Residence from '#models/residence'
import { DomainError } from '#utils/domain_error'

import type { CreateExpenseInput, ExpenseDto } from '../dto/expense.dto.ts'
import { resolveExpenseTarget } from '../expense_target.ts'
import ExpenseRepository from '../repositories/expense_repository.ts'

/**
 * Le rejeu d'une saisie idempotente doit venir de son auteur.
 *
 * L'identifiant dérivé n'est cadré que sur le propriétaire : sans ce contrôle,
 * un gérant réemployant le `client_request_id` d'un autre recevrait une
 * dépense qu'il n'a pas saisie, peut-être hors de son périmètre. Le rejeu
 * légitime — même auteur — passe inchangé : c'est la garantie sur laquelle
 * repose la file hors ligne du mobile.
 */
export function assertSameExpenseAuthor(
  existing: { created_by?: string | null },
  actor: string | null | undefined
): void {
  if ((existing.created_by ?? null) !== (actor ?? null)) {
    throw new DomainError(
      'client_request_id_reused',
      'Cet identifiant de saisie a déjà servi pour une autre dépense.',
      409
    )
  }
}

export class CreateExpenseUseCase {
  constructor(private repo: ExpenseRepository = new ExpenseRepository()) {}

  async execute(input: CreateExpenseInput): Promise<ExpenseDto> {
    if (input.amount <= 0) {
      throw new DomainError('invalid_amount', 'Le montant doit être supérieur à zéro.', 422)
    }

    // Un rejeu rend la dépense déjà écrite avant tout autre contrôle : le bien
    // a pu être supprimé depuis la saisie, et refuser le rejeu laisserait la
    // file du mobile bloquée sur une dépense pourtant enregistrée.
    if (input.client_request_id) {
      const replayed = await this.repo.findByRequestId(input.owner_id, input.client_request_id)
      if (replayed) {
        assertSameExpenseAuthor(replayed, input.created_by)
        return replayed.dto
      }
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

    const created = await this.repo.create({
      ...input,
      property_id: target.property_id,
      residence_id: target.residence_id,
    })

    // Deux rejeux concurrents : la transaction a rendu le document du premier.
    assertSameExpenseAuthor(created, input.created_by)
    return created.dto
  }
}

export default CreateExpenseUseCase
