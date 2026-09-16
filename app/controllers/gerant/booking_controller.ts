import {
  createOwnerBookingValidator,
  cancelBookingValidator,
  extendOwnerBookingValidator,
  listBookingsValidator,
  recordBookingPaymentValidator,
} from '#validators/booking/booking'

import { assertWithinScope, buildScopedWrite } from '#features/managers/scope'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CancelOwnerBookingUseCase,
  CreateOwnerBookingUseCase,
  ExtendOwnerBookingUseCase,
  FindOwnerBookingUseCase,
  ListOwnerBookingsUseCase,
  RecordBookingPaymentUseCase,
} from '../../features/bookings/use_cases/index.ts'

/**
 * Réservations des logements confiés au gérant connecté.
 *
 * Les use cases sont ceux du propriétaire, à qui seul le périmètre est ajouté :
 * les dupliquer dupliquerait la règle métier — tarification, chevauchement,
 * idempotence —, qui divergerait au premier correctif appliqué d'un seul côté.
 *
 * Deux gardes distinctes, et les deux sont nécessaires :
 *
 * - en **lecture**, `scope_property_ids` descend jusqu'à la requête ;
 * - en **écriture** sur une ressource désignée par un identifiant venu du
 *   client, `assertWithinScope` est appelée *avant* toute modification. Le
 *   cadrage sur `owner_id` que portent les use cases ne suffit pas : le gérant
 *   agit pour le compte du propriétaire, et toutes ses réservations passent
 *   donc ce cadrage — y compris celles des logements qui ne lui sont pas
 *   confiés.
 */
export default class GerantBookingController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listBookingsValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListOwnerBookingsUseCase().execute(ctx.scope.ownerId, {
      ...payload,
      scope_property_ids: ctx.scope.propertyIds,
    })

    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const booking = await this.findInScope(ctx)
    return ctx.response.ok({ data: booking })
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createOwnerBookingValidator)

    // `buildScopedWrite` porte les deux gestes d'un coup : elle refuse un
    // logement hors périmètre et pose `owner_id`/`created_by`. Recopier
    // `owner_id` à la main laisserait la garde facultative.
    const write = buildScopedWrite({ property_id: payload.property_id }, ctx.scope)

    const booking = await new CreateOwnerBookingUseCase().execute({
      owner_id: write.owner_id,
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
      created_by: write.created_by,
    })

    return ctx.response.created({ data: booking })
  }

  /** Prolongation d'un séjour comptoir. */
  async update(ctx: HttpContext) {
    await this.findInScope(ctx)

    const payload = await ctx.request.validateUsing(extendOwnerBookingValidator)
    const booking = await new ExtendOwnerBookingUseCase().execute(
      ctx.params.id,
      ctx.scope.ownerId,
      {
        check_out_at: payload.check_out_at.toJSDate(),
        received_amount: payload.received_amount,
      }
    )

    return ctx.response.ok({ data: booking })
  }

  async cancel(ctx: HttpContext) {
    await this.findInScope(ctx)

    const payload = await ctx.request.validateUsing(cancelBookingValidator)
    const booking = await new CancelOwnerBookingUseCase().execute(
      ctx.params.id,
      ctx.scope.ownerId,
      { reason: payload.reason }
    )

    return ctx.response.ok({ data: booking })
  }

  /** Versement reçu au comptoir sur une réservation du périmètre. */
  async recordPayment(ctx: HttpContext) {
    await this.findInScope(ctx)

    const payload = await ctx.request.validateUsing(recordBookingPaymentValidator)
    const booking = await new RecordBookingPaymentUseCase().execute(
      ctx.params.id,
      ctx.scope.ownerId,
      payload.amount
    )

    return ctx.response.ok({ data: booking })
  }

  /**
   * Lit la réservation et vérifie qu'elle relève du périmètre.
   *
   * La lecture précède la garde par nécessité : le périmètre porte sur des
   * logements, et c'est la réservation qui dit lequel. L'ordre est sans danger
   * — rien n'est écrit avant que `assertWithinScope` n'ait rendu la main.
   */
  private async findInScope(ctx: HttpContext) {
    const booking = await new FindOwnerBookingUseCase().execute(ctx.params.id, ctx.scope.ownerId)
    assertWithinScope(ctx.scope, booking.property_id)

    return booking
  }
}
