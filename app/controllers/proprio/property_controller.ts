import { availabilityValidator } from '#validators/booking/booking'
import {
  createPropertyValidator,
  listOwnerPropertiesValidator,
  updatePropertyValidator,
} from '#validators/property/property'

import { attachResidenceValidator } from '#validators/residence/residence'

import type { HttpContext } from '@adonisjs/core/http'

import { GetAvailabilityUseCase } from '../../features/bookings/use_cases/index.ts'
import {
  CreatePropertyUseCase,
  DeletePropertyUseCase,
  FindPropertyUseCase,
  GetPropertyStatsUseCase,
  AttachPropertyToResidenceUseCase,
  ListOwnerPropertiesUseCase,
  PublishPropertyUseCase,
  UnpublishPropertyUseCase,
  UpdatePropertyUseCase,
} from '../../features/properties/use_cases/index.ts'

export default class ProprioPropertyController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listOwnerPropertiesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListOwnerPropertiesUseCase().execute(userId, payload)
    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const property = await new FindPropertyUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: property })
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createPropertyValidator)
    const property = await new CreatePropertyUseCase().execute({
      ...payload,
      available_from: payload.available_from.toJSDate(),
      owner_id: userId,
    })
    return ctx.response.created({ data: property })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updatePropertyValidator)
    const property = await new UpdatePropertyUseCase().execute(
      ctx.params.id,
      {
        ...payload,
        available_from: payload.available_from?.toJSDate(),
      },
      userId
    )
    return ctx.response.ok({ data: property })
  }

  async destroy(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    await new DeletePropertyUseCase().execute(ctx.params.id, userId)
    return ctx.response.noContent()
  }

  async stats(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const data = await new GetPropertyStatsUseCase().execute(userId)
    return ctx.response.ok({ data })
  }

  /**
   * Rattache l'unité à une résidence, ou l'en détache avec `residence_id: null`.
   */
  async attachResidence(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(attachResidenceValidator)
    const property = await new AttachPropertyToResidenceUseCase().execute(
      ctx.params.id,
      userId,
      payload
    )

    return ctx.response.ok({ data: property })
  }

  async publish(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const property = await new PublishPropertyUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: property })
  }

  async unpublish(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const property = await new UnpublishPropertyUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: property })
  }

  /**
   * Périodes déjà réservées sur un bien.
   *
   * Le calendrier de saisie s'en sert pour barrer les dates prises : sans
   * cette lecture, le propriétaire ne découvrirait le conflit qu'au refus de
   * la réservation, après avoir tout saisi.
   */
  async availability(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(availabilityValidator, {
      data: ctx.request.qs(),
    })

    const periods = await new GetAvailabilityUseCase().execute(userId, payload.property_id, {
      // `vine.date()` produit un DateTime Luxon, que le domaine ne manipule pas.
      from: payload.from?.toJSDate(),
      to: payload.to?.toJSDate(),
    })

    return ctx.response.ok({ data: periods })
  }
}
