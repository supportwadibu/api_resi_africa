import AuthSession, { type AuthSessionRecord } from '#models/auth_session'
import TokenService from '#services/token_service'
import User from '#models/user'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { AuthError } from '#utils/auth_error'
import logger from '@adonisjs/core/services/logger'
import type { AuthTokensOutput, RefreshTokensInput } from '#auth/dto/index'

/**
 * Délai pendant lequel un refresh token tout juste tourné peut être représenté
 * sans alerte : une réponse perdue sur un réseau mobile instable fait rejouer
 * l'appel par l'application, et ce rejeu n'est pas un vol.
 */
export const REFRESH_REUSE_GRACE_MS = 60_000

/**
 * Le refresh token présenté a-t-il déjà été échangé, hors délai de grâce ?
 *
 * Un refresh token ne sert qu'une fois. S'il revient longtemps après sa
 * rotation, deux détenteurs l'ont eu en main : le titulaire et un voleur. On
 * ne peut savoir lequel se présente — toutes les sessions du compte tombent.
 */
export function isRefreshReuse(
  session: Pick<AuthSessionRecord, 'is_revoked' | 'revoke_reason' | 'revoked_at'> | null,
  now: Date = new Date()
): boolean {
  if (!session || !session.is_revoked || session.revoke_reason !== 'rotated') return false
  if (!session.revoked_at) return false
  return now.getTime() - session.revoked_at.getTime() > REFRESH_REUSE_GRACE_MS
}

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
    const session = await AuthSession.revokeByRefreshToken(hash, 'rotated')
    if (!session) {
      await this.handleRejected(hash, input)
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

  /**
   * Refresh token refusé : s'il a déjà été tourné, le compte est
   * vraisemblablement compromis. La réponse reste la même `invalid_refresh` —
   * l'appelant n'a pas à savoir ce qui a été détecté.
   */
  private async handleRejected(hash: string, input: RefreshTokensInput): Promise<void> {
    const previous = await AuthSession.findOne({ refresh_token: hash })
    if (!previous || !isRefreshReuse(previous)) return

    const revoked = await AuthSession.revokeAllForUser(previous.user_id, 'suspicious')
    logger.warn(
      {
        user_id: previous.user_id,
        revoked_sessions: revoked,
        ip: input.device.ip_address,
        user_agent: input.device.user_agent,
      },
      'Refresh token réutilisé après rotation : sessions du compte révoquées'
    )
  }
}

export default RefreshTokensUseCase
