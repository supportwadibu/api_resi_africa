import { submitOwnerProfileValidator } from '#validators/owner/owner_profile'

import type { HttpContext } from '@adonisjs/core/http'

import {
  GetOwnerProfileUseCase,
  SubmitOwnerProfileUseCase,
} from '../../features/owners/use_cases/index.ts'

/**
 * Dossier de validation du propriétaire connecté.
 *
 * Ces deux routes ferment la boucle d'inscription : le compte est créé à
 * l'authentification, mais reste `pending` jusqu'au dépôt des pièces
 * d'identité, et sera suspendu à la fin de l'essai gratuit sans validation.
 */
export default class ProprioProfileController {
  /**
   * GET /proprio/profile
   *
   * État du dossier, avec URLs signées vers les justificatifs déjà déposés.
   */
  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const profile = await new GetOwnerProfileUseCase().execute(userId)
    return ctx.response.ok({ data: profile })
  }

  /**
   * POST /proprio/profile
   *
   * Dépôt ou correction du dossier. Reçu en `multipart/form-data` : les deux
   * faces de la pièce d'identité accompagnent les champs texte.
   */
  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(submitOwnerProfileValidator)

    const profile = await new SubmitOwnerProfileUseCase().execute(
      {
        user_id: userId,
        full_name: payload.full_name,
        phone: payload.phone,
        address: payload.address,
        city: payload.city,
        country: payload.country,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
      },
      {
        front: payload.id_document_front,
        back: payload.id_document_back,
      }
    )

    return ctx.response.ok({ data: profile })
  }
}
