import {
  CreatePromoCodeUseCase,
  DeletePromoCodeUseCase,
  ListPromoCodesUseCase,
  UpdatePromoCodeUseCase,
} from '#features/promo_codes/use_cases/index'
import {
  createPromoCodeValidator,
  updatePromoCodeValidator,
} from '#validators/promo_code/promo_code'

import type { HttpContext } from '@adonisjs/core/http'
import type { DateTime } from 'luxon'

/**
 * Convertit une borne de validité reçue.
 *
 * `null` efface la borne et `undefined` la laisse en place : les deux doivent
 * traverser la conversion sans se confondre.
 */
function toDate(value: DateTime | null | undefined): Date | null | undefined {
  if (value === undefined || value === null) return value
  return value.toJSDate()
}

export default class AdminPromoCodesController {
  /** GET /admin/promo-codes */
  async index(ctx: HttpContext) {
    const codes = await new ListPromoCodesUseCase().execute()
    return ctx.response.ok({ data: codes })
  }

  /** POST /admin/promo-codes */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createPromoCodeValidator)
    const code = await new CreatePromoCodeUseCase().execute({
      ...payload,
      starts_at: toDate(payload.starts_at),
      expires_at: toDate(payload.expires_at),
    })
    return ctx.response.created({ data: code })
  }

  /** PATCH /admin/promo-codes/:id */
  async update(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(updatePromoCodeValidator)
    const code = await new UpdatePromoCodeUseCase().execute(ctx.params.id, {
      ...payload,
      starts_at: toDate(payload.starts_at),
      expires_at: toDate(payload.expires_at),
    })
    return ctx.response.ok({ data: code })
  }

  /** DELETE /admin/promo-codes/:id */
  async destroy(ctx: HttpContext) {
    await new DeletePromoCodeUseCase().execute(ctx.params.id)
    return ctx.response.noContent()
  }
}
