import AuthSession from '#models/auth_session'
import TokenService from '#services/token_service'
import type { LogoutInput, LogoutOutput } from '#auth/dto/index'

/**
 * Use case : révoque la session liée au refresh token fourni.
 * Idempotent : retourne `{ revoked: false }` si la session est déjà révoquée
 * ou inconnue.
 */
export class LogoutUseCase {
  async execute(input: LogoutInput): Promise<LogoutOutput> {
    const hash = TokenService.hashRefresh(input.refresh_token)
    const session = await AuthSession.revokeByRefreshToken(hash, input.reason ?? 'logout')
    return { revoked: !!session }
  }
}

export default LogoutUseCase
