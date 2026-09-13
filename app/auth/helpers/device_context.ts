import type { HttpContext } from '@adonisjs/core/http'
import type { DeviceContext } from '#auth/dto/index'

/**
 * Extrait le contexte d'appareil depuis la requête HTTP.
 * Headers optionnels : `X-Device-Name`, `X-Platform`.
 */
export function getDeviceContext(ctx: HttpContext): DeviceContext {
  return {
    ip_address: ctx.request.ip(),
    user_agent: ctx.request.header('user-agent') ?? 'unknown',
    device_name: ctx.request.header('x-device-name') ?? null,
    platform: (ctx.request.header('x-platform') as DeviceContext['platform']) ?? 'unknown',
  }
}
