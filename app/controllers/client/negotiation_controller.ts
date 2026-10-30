import type { HttpContext } from '@adonisjs/core/http'

import NegotiateUseCase from '../../features/negotiations/use_cases/negotiate.use_case.ts'

/** Négociation d'un logement par le client : paliers révélés un à un. */
export default class ClientNegotiationController {
  /** GET /client/properties/:property_id/negotiation */
  async show(ctx: HttpContext) {
    const data = await new NegotiateUseCase().current(ctx.params.property_id, ctx.authUser!.id)
    return ctx.response.ok({ data })
  }

  /** POST /client/properties/:property_id/negotiation/next */
  async next(ctx: HttpContext) {
    const data = await new NegotiateUseCase().next(ctx.params.property_id, ctx.authUser!.id)
    return ctx.response.ok({ data })
  }
}
