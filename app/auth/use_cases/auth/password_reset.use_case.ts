import type { AuthTokensOutput, PasswordResetInput } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { otpReasonMessage } from '#auth/helpers/otp_reason'
import { resetChannel, resetRefusal } from '#auth/helpers/password_reset'
import { assertNotPendingDeletion } from '#auth/helpers/pending_deletion'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import AuthSession from '#models/auth_session'
import User from '#models/user'
import HashService from '#services/hash_service'
import OtpService from '#services/otp_service'
import { AuthError } from '#utils/auth_error'

/**
 * Use case : remplace le mot de passe avec le code reçu, puis ouvre la
 * session — l'utilisateur n'a pas à se reconnecter avec ce qu'il vient de
 * saisir.
 *
 * Toutes les autres sessions sont fermées : on réinitialise souvent après
 * avoir perdu un téléphone, qui ne doit pas garder l'accès.
 */
export class PasswordResetUseCase {
  async execute(input: PasswordResetInput): Promise<AuthTokensOutput> {
    await assertRateLimit(input.identifier, 'verify')

    const channel = resetChannel(input.identifier)
    const user = await User.findOne(
      channel === 'email' ? { email: input.identifier } : { phone: input.identifier }
    )

    // Même réponse qu'un mauvais code : un compte inexistant ne se distingue
    // pas d'une erreur de saisie.
    if (!user) {
      await logAuthAttempt({
        type: 'verify',
        status: 'failed',
        channel,
        target: input.identifier,
        failure_reason: 'user_not_found',
        device: input.device,
      })
      throw new AuthError('invalid_code', 'Code invalide.', 400)
    }

    const result = await OtpService.verify({
      userId: user._id,
      purpose: 'reset',
      plainCode: input.code,
    })
    if (!result.ok) {
      await logAuthAttempt({
        user_id: user._id,
        type: 'verify',
        status: result.reason === 'expired' ? 'expired' : 'failed',
        channel,
        target: input.identifier,
        failure_reason: result.reason,
        device: input.device,
      })
      throw new AuthError(result.reason, otpReasonMessage(result.reason), 400)
    }

    // Après le code : seul le titulaire apprend l'état de son compte. L'état a
    // pu changer depuis l'envoi du code — suppression demandée, compte
    // désactivé entre-temps.
    assertNotPendingDeletion(user)
    if (resetRefusal(user.raw)) {
      throw new AuthError('account_disabled', 'Compte désactivé.', 403)
    }

    user.password = await HashService.make(input.password)
    user.last_login_at = new Date()
    await user.save()

    await AuthSession.revokeAllForUser(user._id, 'password_reset')
    await logAuthAttempt({
      user_id: user._id,
      otp_id: result.otp._id,
      type: 'verify',
      status: 'success',
      channel,
      target: input.identifier,
      device: input.device,
    })

    return issueTokens(user, input.device)
  }
}

export default PasswordResetUseCase
