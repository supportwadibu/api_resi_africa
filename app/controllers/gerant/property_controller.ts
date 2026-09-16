import { availabilityValidator } from '#validators/booking/booking'
import {
  listOwnerPropertiesValidator,
  updateAvailabilityValidator,
} from '#validators/property/property'

import { assertWithinScope } from '#features/managers/scope'

import type { HttpContext } from '@adonisjs/core/http'

import { GetAvailabilityUseCase } from '../../features/bookings/use_cases/index.ts'
import {
  FindPropertyUseCase,
  ListOwnerPropertiesUseCase,
  UpdatePropertyUseCase,
} from '../../features/properties/use_cases/index.ts'

/**
 * Logements confiés au gérant connecté.
 *
 * En lecture seule, à une exception près : la disponibilité. Créer, supprimer
 * ou retarifer un logement reste fermé au gérant — ces gestes n'ont pas de
 * route ici, et sont donc fermés par construction plutôt que par une condition
 * qu'on peut oublier d'écrire.
 */
export default class GerantPropertyController {
  async index(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(listOwnerPropertiesValidator, {
      data: ctx.request.qs(),
    })

    const result = await new ListOwnerPropertiesUseCase().execute(ctx.scope.ownerId, {
      ...payload,
      scope_property_ids: ctx.scope.propertyIds,
    })

    return ctx.response.ok(result)
  }

  async show(ctx: HttpContext) {
    // Le périmètre se juge sur l'identifiant demandé, sans lecture préalable :
    // un logement *est* l'unité d'affectation.
    assertWithinScope(ctx.scope, ctx.params.id)

    const property = await new FindPropertyUseCase().execute(ctx.params.id, ctx.scope.ownerId)
    return ctx.response.ok({ data: property })
  }

  /**
   * Disponibilité d'un logement — statut et date de remise en service.
   *
   * Schéma dédié plutôt que le validateur de mise à jour du propriétaire :
   * celui-ci accepte `pricing`, et le rouvrir au gérant lui donnerait la main
   * sur la grille tarifaire.
   */
  async updateAvailability(ctx: HttpContext) {
    assertWithinScope(ctx.scope, ctx.params.id)

    const payload = await ctx.request.validateUsing(updateAvailabilityValidator)

    const property = await new UpdatePropertyUseCase().execute(
      ctx.params.id,
      {
        status: payload.status,
        available_from: payload.available_from?.toJSDate(),
      },
      ctx.scope.ownerId
    )

    return ctx.response.ok({ data: property })
  }

  /**
   * Périodes déjà réservées sur un logement du périmètre.
   *
   * Le calendrier de saisie s'en sert pour barrer les dates prises : sans cette
   * lecture, le gérant ne découvrirait le conflit qu'au refus de la
   * réservation, après avoir tout saisi.
   */
  async availability(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(availabilityValidator, {
      data: ctx.request.qs(),
    })

    assertWithinScope(ctx.scope, payload.property_id)

    const periods = await new GetAvailabilityUseCase().execute(
      ctx.scope.ownerId,
      payload.property_id,
      {
        // `vine.date()` produit un DateTime Luxon, que le domaine ne manipule pas.
        from: payload.from?.toJSDate(),
        to: payload.to?.toJSDate(),
      }
    )

    return ctx.response.ok({ data: periods })
  }
}
