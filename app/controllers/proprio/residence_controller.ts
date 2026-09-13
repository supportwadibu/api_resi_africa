import {
  createResidenceValidator,
  listResidencesValidator,
  updateResidenceValidator,
} from '#validators/residence/residence'

import type { HttpContext } from '@adonisjs/core/http'

import {
  CreateResidenceUseCase,
  DeleteResidenceUseCase,
  FindResidenceUseCase,
  ListOwnerResidencesUseCase,
  UpdateResidenceUseCase,
} from '../../features/residences/use_cases/index.ts'

export default class ProprioResidenceController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(listResidencesValidator, {
      data: ctx.request.qs(),
    })
    const result = await new ListOwnerResidencesUseCase().execute(userId, payload)
    return ctx.response.ok(result)
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createResidenceValidator)
    const residence = await new CreateResidenceUseCase().execute({
      owner_id: userId,
      name: payload.name,
      description: payload.description ?? '',
      address: payload.address,
      media: payload.media,
      amenities: payload.amenities,
    })

    return ctx.response.created({ data: residence })
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const residence = await new FindResidenceUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: residence })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateResidenceValidator)
    const residence = await new UpdateResidenceUseCase().execute(ctx.params.id, payload, userId)
    return ctx.response.ok({ data: residence })
  }

  async destroy(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    await new DeleteResidenceUseCase().execute(ctx.params.id, userId)
    return ctx.response.noContent()
  }
}
