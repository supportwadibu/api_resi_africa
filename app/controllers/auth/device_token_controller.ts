import {
  registerDeviceTokenValidator,
  unregisterDeviceTokenValidator,
} from '#validators/notification/notification'

import type { HttpContext } from '@adonisjs/core/http'

import {
  RegisterDeviceTokenUseCase,
  UnregisterDeviceTokenUseCase,
} from '../../features/notifications/use_cases/index.ts'

/** Appareils du compte connecté, pour les notifications push. Tous rôles. */
export default class DeviceTokenController {
  /** POST /auth/device-tokens */
  async store(ctx: HttpContext) {
    const user = ctx.authUser
    if (!user) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(registerDeviceTokenValidator)
    await new RegisterDeviceTokenUseCase().execute({
      user_id: user.id,
      role: user.role,
      token: payload.token,
      platform: payload.platform,
    })

    return ctx.response.noContent()
  }

  /** DELETE /auth/device-tokens */
  async destroy(ctx: HttpContext) {
    const user = ctx.authUser
    if (!user) return ctx.response.unauthorized({ error: 'Non authentifié' })

    const payload = await ctx.request.validateUsing(unregisterDeviceTokenValidator)
    await new UnregisterDeviceTokenUseCase().execute(user.id, payload.token)

    return ctx.response.noContent()
  }
}
