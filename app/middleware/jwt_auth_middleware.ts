import AuthSession from '#models/auth_session'
import Role from '#models/role'
import User from '#models/user'
import TokenService, { type AccessTokenPayload } from '#services/token_service'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export interface AuthenticatedUser {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  role: string
  is_verified: boolean
  is_active: boolean
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    authUser: AuthenticatedUser
    authPayload: AccessTokenPayload
  }
}

export default class JwtAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const header = ctx.request.header('authorization')
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return ctx.response.unauthorized({ code: 'missing_token', message: 'Token manquant.' })
    }

    const token = header.slice(7).trim()
    let payload: AccessTokenPayload
    try {
      payload = TokenService.verifyAccess(token)
    } catch {
      return ctx.response.unauthorized({ code: 'invalid_token', message: 'Token invalide.' })
    }

    const revoked = await AuthSession.isAccessTokenRevoked(payload.jti)
    if (revoked) {
      return ctx.response.unauthorized({ code: 'revoked', message: 'Session révoquée.' })
    }

    const user = await User.findById(payload.sub)
    if (!user || !user.is_active) {
      return ctx.response.unauthorized({ code: 'invalid_user', message: 'Utilisateur invalide.' })
    }

    let roleName = payload.role
    if (!roleName) {
      const role = await Role.findById(user.role_id)
      roleName = role?.name ?? 'client'
    }

    ctx.authPayload = payload
    ctx.authUser = {
      id: user._id,
      full_name: user.full_name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: roleName,
      is_verified: user.is_verified,
      is_active: user.is_active,
    }

    return next()
  }
}
