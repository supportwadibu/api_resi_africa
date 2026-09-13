import HashService from '#services/hash_service'
import User, { type AuthChannel } from '#models/user'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import { AuthError } from '#utils/auth_error'
import type { AuthTokensOutput, LoginInput } from '#auth/dto/index'

/**
 * Use case : authentifie un utilisateur par email/phone + password
 * et délivre une nouvelle paire access/refresh.
 */
export class LoginUseCase {
  async execute(input: LoginInput): Promise<AuthTokensOutput> {
    await assertRateLimit(input.identifier, 'verify')

    const isEmail = input.identifier.includes('@')
    const channel: AuthChannel = isEmail ? 'email' : 'phone'
    const query = isEmail ? { email: input.identifier } : { phone: input.identifier }

    const user = await User.findOne(query)

    if (!user) {
      await logAuthAttempt({
        type: 'verify',
        status: 'failed',
        channel,
        target: input.identifier,
        failure_reason: 'user_not_found',
        device: input.device,
      })
      throw new AuthError('invalid_credentials', 'Identifiants invalides.', 401)
    }

    if (!user.is_active) {
      throw new AuthError('account_disabled', 'Compte désactivé.', 403)
    }
    if (!user.is_verified) {
      throw new AuthError(
        'account_not_verified',
        "Compte non vérifié. Terminez l'inscription par OTP.",
        403
      )
    }

    // Compte créé via un provider externe : aucun mot de passe n'a jamais été défini.
    if (!user.password) {
      await logAuthAttempt({
        user_id: user._id,
        type: 'verify',
        status: 'failed',
        channel,
        target: input.identifier,
        failure_reason: 'password_not_set',
        device: input.device,
      })
      throw new AuthError(
        'password_not_set',
        'Ce compte utilise la connexion Google. Connectez-vous avec Google.',
        401
      )
    }

    const passwordOk = await HashService.verify(input.password, user.password)
    if (!passwordOk) {
      await logAuthAttempt({
        user_id: user._id,
        type: 'verify',
        status: 'failed',
        channel,
        target: input.identifier,
        failure_reason: 'invalid_password',
        device: input.device,
      })
      throw new AuthError('invalid_credentials', 'Identifiants invalides.', 401)
    }

    user.last_login_at = new Date()
    await user.save()

    await logAuthAttempt({
      user_id: user._id,
      type: 'verify',
      status: 'success',
      channel,
      target: input.identifier,
      device: input.device,
    })

    return issueTokens(user, input.device)
  }
}

export default LoginUseCase
