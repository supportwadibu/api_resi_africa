import AuthSession from '#models/auth_session'
import TokenService from '#services/token_service'
import User from '#models/user'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { AuthError } from '#utils/auth_error'
import type { AuthTokensOutput, RefreshTokensInput } from '#auth/dto/index'

/**
 * Use case : valide un refresh token, révoque la session courante (rotation)
 * et délivre une nouvelle paire access/refresh.
 */
export class RefreshTokensUseCase {
  async execute(input: RefreshTokensInput): Promise<AuthTokensOutput> {
    let payload
    try {
      payload = TokenService.verifyRefresh(input.refresh_token)
    } catch {
      throw new AuthError('invalid_refresh', 'Refresh token invalide.', 401)
    }

    const hash = TokenService.hashRefresh(input.refresh_token)

    // Rotation : la révocation est atomique et conditionnée à une session
    // encore active. Deux rafraîchissements concurrents avec le même token ne
    // peuvent donc pas obtenir chacun une paire valide — le second reçoit
    // `null` et est rejeté.
    const session = await AuthSession.revokeByRefreshToken(hash, 'logout')
    if (!session) {
      throw new AuthError('invalid_refresh', 'Session révoquée ou inconnue.', 401)
    }
    if (session.expires_at.getTime() <= Date.now()) {
      throw new AuthError('expired_refresh', 'Refresh token expiré.', 401)
    }

    const user = await User.findById(payload.sub)
    if (!user || !user.is_active) {
      throw new AuthError('invalid_refresh', 'Utilisateur invalide.', 401)
    }

    return issueTokens(user, input.device)
  }
}

export default RefreshTokensUseCase
