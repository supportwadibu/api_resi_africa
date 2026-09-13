import {
  createExpenseValidator,
  listExpensesValidator,
  updateExpenseValidator,
} from '#validators/expense/expense'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateExpenseUseCase,
  DeleteExpenseUseCase,
  FindExpenseUseCase,
  GetExpenseSummaryUseCase,
  ListOwnerExpensesUseCase,
  UpdateExpenseUseCase,
} from '../../features/expenses/use_cases/index.ts'

export default class ProprioExpenseController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listExpensesValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListOwnerExpensesUseCase().execute(userId, {
      ...payload,
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
    })
    return ctx.response.ok(result)
  }

  /** Total et ventilation par catégorie, sur le même jeu de filtres que `index`. */
  async summary(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listExpensesValidator, {
      data: ctx.request.qs(),
    })

    const summary = await new GetExpenseSummaryUseCase().execute(userId, {
      ...payload,
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
    })
    return ctx.response.ok({ data: summary })
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const expense = await new FindExpenseUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: expense })
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createExpenseValidator)
    const expense = await new CreateExpenseUseCase().execute({
      ...payload,
      spent_at: payload.spent_at.toJSDate(),
      owner_id: userId,
    })
    return ctx.response.created({ data: expense })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateExpenseValidator)
    const expense = await new UpdateExpenseUseCase().execute(
      ctx.params.id,
      {
        ...payload,
        spent_at: payload.spent_at?.toJSDate(),
      },
      userId
    )
    return ctx.response.ok({ data: expense })
  }

  async destroy(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    await new DeleteExpenseUseCase().execute(ctx.params.id, userId)
    return ctx.response.noContent()
  }
}
