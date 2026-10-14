/* eslint-disable prettier/prettier */
import type {
  AuthTokensOutput,
  DeviceContext,
} from '#auth/dto/index'
import AuthSession from '#models/auth_session'
import Role from '#models/role'
import type { UserEntity } from '#models/user'
import TokenService from '#services/token_service'

/**
 * Émet une nouvelle paire access/refresh + crée la session correspondante.
 * Utilisé par : registerVerify, login, refresh.
 */
export async function issueTokens(
  user: UserEntity,
  device: DeviceContext
): Promise<AuthTokensOutput> {
  const roleName = await resolveRoleName(user)

  const access = TokenService.signAccess({
    sub: user._id,
    role: roleName,
  })
  const refresh = TokenService.signRefresh({ sub: user._id })

  await AuthSession.create({
    user_id: user._id,
    refresh_token: TokenService.hashRefresh(refresh.token),
    access_token_jti: access.jti,
    device_info: {
      ip_address: device.ip_address,
      user_agent: device.user_agent,
      device_name: device.device_name ?? null,
      platform: device.platform ?? 'unknown',
    },
  })

  return {
    access_token: access.token,
    access_token_expires_in: access.expiresIn,
    refresh_token: refresh.token,
    refresh_token_expires_in: refresh.expiresIn,
    user: {
      id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: roleName,
      is_verified: user.is_verified,
      avatar_url: user.avatar_url ?? null,
    },
  }
}

/**
 * Résout le nom du rôle.
 *
 * Firestore n'a pas d'équivalent de `populate` : `role_id` reste toujours un
 * identifiant. La lecture est directe — le nom du rôle est la clé de son
 * document — et retombe sur `client` si le rôle référencé n'existe plus.
 */
async function resolveRoleName(user: UserEntity): Promise<string> {
  const role = await Role.findById(user.role_id)
  return role?.name ?? 'client'
}
