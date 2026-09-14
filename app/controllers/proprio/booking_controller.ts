import {
  createOwnerBookingValidator,
  extendOwnerBookingValidator,
  listBookingsValidator,
} from '#validators/booking/booking'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CheckOutBookingUseCase,
  CreateOwnerBookingUseCase,
  ExtendOwnerBookingUseCase,
  GetBookingStatsUseCase,
  ListOwnerBookingsUseCase,
} from '../../features/bookings/use_cases/index.ts'

export default class ProprioBookingController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listBookingsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListOwnerBookingsUseCase().execute(userId, payload)
    return ctx.response.ok(result)
  }

  /**
   * Chiffres du tableau de bord des réservations : occupation du mois,
   * séjours à venir et en cours, revenu du mois rapporté au précédent.
   *
   * Sans paramètre de période : l'écran affiche le mois en cours, et laisser
   * le cadrage au client ferait diverger les trois tuiles et le bloc revenus.
   */
  async stats(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const stats = await new GetBookingStatsUseCase().execute(userId)
    return ctx.response.ok({ data: stats })
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createOwnerBookingValidator)

    const booking = await new CreateOwnerBookingUseCase().execute({
      owner_id: userId,
      property_id: payload.property_id,
      client_id: payload.client_id,
      stay_type: payload.stay_type,
      check_in_at: payload.check_in_at.toJSDate(),
      check_out_at: payload.check_out_at?.toJSDate(),
      received_amount: payload.received_amount,
      deposit_amount: payload.deposit_amount,
      message: payload.message,
      is_check_in: payload.is_check_in ?? false,
      client_request_id: payload.client_request_id,
    })

    return ctx.response.created({ data: booking })
  }

  async extend(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(extendOwnerBookingValidator)
    const booking = await new ExtendOwnerBookingUseCase().execute(ctx.params.id, userId, {
      check_out_at: payload.check_out_at.toJSDate(),
      received_amount: payload.received_amount,
    })

    return ctx.response.ok({ data: booking })
  }

  async checkOut(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const booking = await new CheckOutBookingUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: booking })
  }
}
