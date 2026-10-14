import {
  createManagerValidator,
  setManagerStatusValidator,
  updateManagerPropertiesValidator,
  updateManagerValidator,
} from '#validators/manager/manager'

import type { HttpContext } from '@adonisjs/core/http'

import CreateManagerUseCase from '../../features/managers/use_cases/create_manager.use_case.ts'
import GetManagerUseCase from '../../features/managers/use_cases/get_manager.use_case.ts'
import ListManagersUseCase from '../../features/managers/use_cases/list_managers.use_case.ts'
import SetManagerStatusUseCase from '../../features/managers/use_cases/set_manager_status.use_case.ts'
import UpdateManagerUseCase from '../../features/managers/use_cases/update_manager.use_case.ts'
import UpdateManagerPropertiesUseCase from '../../features/managers/use_cases/update_manager_properties.use_case.ts'

/** Gérants du propriétaire connecté : comptes et périmètres. */
export default class ProprioManagerController {
  async index(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const managers = await new ListManagersUseCase().execute(userId)
    return ctx.response.ok({ data: managers })
  }

  async store(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(createManagerValidator)

    const manager = await new CreateManagerUseCase().execute({
      owner_id: userId,
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      property_ids: payload.property_ids,
    })

    return ctx.response.created({ data: manager })
  }

  async show(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const manager = await new GetManagerUseCase().execute(ctx.params.id, userId)
    return ctx.response.ok({ data: manager })
  }

  async update(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateManagerValidator)

    const manager = await new UpdateManagerUseCase().execute(ctx.params.id, userId, {
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
    })

    return ctx.response.ok({ data: manager })
  }

  /** `PUT` : la charge utile est le périmètre complet, pas un ajout. */
  async replaceProperties(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(updateManagerPropertiesValidator)

    const manager = await new UpdateManagerPropertiesUseCase().execute(
      ctx.params.id,
      userId,
      payload.property_ids
    )

    return ctx.response.ok({ data: manager })
  }

  async setStatus(ctx: HttpContext) {
    const userId = ctx.authUser?.id
    if (!userId) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(setManagerStatusValidator)

    const manager = await new SetManagerStatusUseCase().execute(
      ctx.params.id,
      userId,
      payload.is_active
    )

    return ctx.response.ok({ data: manager })
  }
}
