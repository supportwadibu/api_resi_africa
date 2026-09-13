import { getDeviceContext } from '#auth/helpers/device_context'
import {
  GoogleLoginUseCase,
  LoginUseCase,
  LogoutUseCase,
  RefreshTokensUseCase,
  RegisterInitUseCase,
  RegisterVerifyUseCase,
} from '#auth/use_cases/index'
import { AuthError } from '#utils/auth_error'
import {
  googleLoginValidator,
  loginValidator,
  logoutValidator,
  refreshValidator,
  registerInitValidator,
  registerVerifyValidator,
} from '#validators/auth/auth'

import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'

export default class AuthController {
  async registerInit(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(registerInitValidator)

    if (payload.auth_channel === 'email' && !payload.email) {
      throw new AuthError('missing_email', "Le champ 'email' est requis.", 422)
    }
    if (payload.auth_channel === 'phone' && !payload.phone) {
      throw new AuthError('missing_phone', "Le champ 'phone' est requis.", 422)
    }

    const device = getDeviceContext(ctx)
    const result = await new RegisterInitUseCase().execute({
      full_name: payload.full_name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      password: payload.password,
      auth_channel: payload.auth_channel,
      role_name: payload.role_name,
      device,
    })
    return ctx.response.created({
      message: 'OTP envoyé. Vérifiez pour finaliser votre inscription.',
      user_id: result.user_id,
      target: result.otp_target,
      ...(app.inProduction ? {} : { dev_otp_code: result.plain_code }),
    })
  }

  async registerVerify(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(registerVerifyValidator)
    const device = getDeviceContext(ctx)
    const tokens = await new RegisterVerifyUseCase().execute({ ...payload, device })
    return ctx.response.ok(tokens)
  }

  async login(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(loginValidator)
    const device = getDeviceContext(ctx)
    const tokens = await new LoginUseCase().execute({ ...payload, device })
    return ctx.response.ok(tokens)
  }

  async google(ctx: HttpContext) {
    const { id_token: idToken } = await ctx.request.validateUsing(googleLoginValidator)
    const device = getDeviceContext(ctx)
    const result = await new GoogleLoginUseCase().execute({ id_token: idToken, device })

    return result.is_new_user ? ctx.response.created(result) : ctx.response.ok(result)
  }

  async refresh(ctx: HttpContext) {
    const { refresh_token: refreshToken } = await ctx.request.validateUsing(refreshValidator)
    const device = getDeviceContext(ctx)
    const tokens = await new RefreshTokensUseCase().execute({
      refresh_token: refreshToken,
      device,
    })
    return ctx.response.ok(tokens)
  }

  async logout(ctx: HttpContext) {
    const { refresh_token: refreshToken } = await ctx.request.validateUsing(logoutValidator)
    const { revoked } = await new LogoutUseCase().execute({ refresh_token: refreshToken })
    return ctx.response.ok({ revoked, message: 'Déconnexion effectuée.' })
  }

  async me(ctx: HttpContext) {
    return ctx.response.ok({ user: ctx.authUser })
  }
}
