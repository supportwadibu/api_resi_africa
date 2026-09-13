import {
  createClientValidator,
  listClientsValidator,
  lookupClientValidator,
  updateClientValidator,
} from '#validators/client/client'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateClientUseCase,
  GetClientUseCase,
  ListClientBookingsUseCase,
  ListClientsUseCase,
  LookupClientUseCase,
  UpdateClientUseCase,
} from '../../features/clients/use_cases/index.ts'

/** Carnet de clients du propriétaire connecté. */
export default class ProprioClientController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listClientsValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListClientsUseCase().execute({ ...payload, owner_id: userId })
    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createClientValidator)

    const { client, already_existed: alreadyExisted } = await new CreateClientUseCase().execute(
      {
        owner_id: userId,
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
      },
      { front: payload.id_document_front, back: payload.id_document_back }
    )

    // 200 et non 201 quand la fiche existait : rien n'a été créé, et
    // l'application doit pouvoir proposer de réutiliser la fiche trouvée.
    return alreadyExisted
      ? ctx.response.ok({ data: client, already_existed: true })
      : ctx.response.created({ data: client, already_existed: false })
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const client = await new GetClientUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: client })
  }

  /** Historique des séjours d'un client, statistiques recalculées comprises. */
  async bookings(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const result = await new ListClientBookingsUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok(result)
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateClientValidator)

    const client = await new UpdateClientUseCase().execute(
      ctx.params.id,
      userId,
      {
        full_name: payload.full_name,
        phone: payload.phone,
        whatsapp: payload.whatsapp,
        id_document_type: payload.id_document_type,
        id_document_number: payload.id_document_number,
        status: payload.status,
      },
      { front: payload.id_document_front, back: payload.id_document_back }
    )

    return ctx.response.ok({ data: client })
  }

  async lookup(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(lookupClientValidator)
    const result = await new LookupClientUseCase().execute(userId, payload.phone)
    return ctx.response.ok(result)
  }
}
