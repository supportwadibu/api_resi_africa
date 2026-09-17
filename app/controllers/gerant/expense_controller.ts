import {
  createExpenseValidator,
  listExpensesValidator,
  updateExpenseValidator,
} from '#validators/expense/expense'

import { assertWithinScope, buildScopedWrite } from '#features/managers/scope'
import { DomainError } from '#utils/domain_error'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateExpenseUseCase,
  DeleteExpenseUseCase,
  FindExpenseUseCase,
  ListOwnerExpensesUseCase,
  UpdateExpenseUseCase,
} from '../../features/expenses/use_cases/index.ts'

/**
 * Dépenses saisies sur les logements confiés au gérant connecté.
 *
 * Une charge **commune de résidence** lui est fermée : elle n'est rattachée à
 * aucun logement, relève de la résidence entière — y compris des logements qui
 * ne lui sont pas confiés — et entre dans le net du propriétaire, que le gérant
 * ne voit pas. Une dépense de gérant porte donc toujours un `property_id`.
 */
export default class GerantExpenseController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listExpensesValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListOwnerExpensesUseCase().execute(ctx.scope.ownerId, {
      ...payload,
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
      scope_property_ids: ctx.scope.propertyIds,
    })

    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createExpenseValidator)

    if (!payload.property_id) {
      throw new DomainError(
        'property_required',
        'Une dépense de gérant doit porter sur un de vos logements.',
        422
      )
    }

    // `buildScopedWrite` refuse un logement hors périmètre et pose
    // `owner_id`/`created_by` : recopier `owner_id` à la main laisserait la
    // garde facultative.
    const write = buildScopedWrite({ property_id: payload.property_id }, ctx.scope)

    const expense = await new CreateExpenseUseCase().execute({
      category: payload.category,
      amount: payload.amount,
      spent_at: payload.spent_at.toJSDate(),
      note: payload.note,
      owner_id: write.owner_id,
      property_id: write.property_id,
      // Une charge commune est fermée au gérant : le rattachement reste celui
      // du logement.
      residence_id: null,
      created_by: write.created_by,
    })

    return ctx.response.created({ data: expense })
  }

  async update(ctx: HttpContext) {
    await this.assertExpenseInScope(ctx)

    const payload = await ctx.request.validateUsing(updateExpenseValidator)

    // Réimputer vers une résidence, ou vers un logement hors périmètre,
    // reviendrait à sortir la dépense du périmètre par une modification.
    if (payload.residence_id) {
      throw new DomainError(
        'property_required',
        'Une dépense de gérant doit porter sur un de vos logements.',
        422
      )
    }
    if (payload.property_id !== undefined) {
      assertWithinScope(ctx.scope, payload.property_id)
    }

    const expense = await new UpdateExpenseUseCase().execute(
      ctx.params.id,
      { ...payload, spent_at: payload.spent_at?.toJSDate() },
      ctx.scope.ownerId
    )

    return ctx.response.ok({ data: expense })
  }

  async destroy(ctx: HttpContext) {
    await this.assertExpenseInScope(ctx)

    await new DeleteExpenseUseCase().execute(ctx.params.id, ctx.scope.ownerId)
    return ctx.response.noContent()
  }

  /**
   * La dépense relève-t-elle du périmètre ?
   *
   * La lecture précède la garde par nécessité : c'est la dépense qui dit sur
   * quel logement elle porte. Le cadrage sur `owner_id` du use case ne suffit
   * pas — toutes les dépenses du propriétaire le passent, y compris celles
   * d'un autre gérant.
   */
  private async assertExpenseInScope(ctx: HttpContext) {
    const expense = await new FindExpenseUseCase().execute(ctx.params.id, ctx.scope.ownerId)
    assertWithinScope(ctx.scope, expense.property_id)

    return expense
  }
}
