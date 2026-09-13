/* eslint-disable prettier/prettier */
import type {
  AuthTokensOutput,
  RegisterVerifyInput,
} from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { issueTokens } from '#auth/helpers/issue_tokens'
import { otpReasonMessage } from '#auth/helpers/otp_reason'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import User from '#models/user'
import OtpService from '#services/otp_service'
import { AuthError } from '#utils/auth_error'

/**
 * Use case : vérifie l'OTP d'inscription, active le compte et délivre les tokens.
 */
export class RegisterVerifyUseCase {
  async execute(input: RegisterVerifyInput): Promise<AuthTokensOutput> {
    await assertRateLimit(input.target, 'verify')

    const userQuery = input.channel === 'email' ? { email: input.target } : { phone: input.target }
    const user = await User.findOne(userQuery)

    if (!user) {
      await logAuthAttempt({
        type: 'verify',
        status: 'failed',
        channel: input.channel,
        target: input.target,
        failure_reason: 'user_not_found',
        device: input.device,
      })
      throw new AuthError('invalid_code', 'Code invalide.', 400)
    }

    const result = await OtpService.verify({
      userId: user._id,
      purpose: 'register',
      plainCode: input.code,
    })

    if (!result.ok) {
      await logAuthAttempt({
        user_id: user._id,
        type: 'verify',
        status: result.reason === 'expired' ? 'expired' : 'failed',
        channel: input.channel,
        target: input.target,
        failure_reason: result.reason,
        device: input.device,
      })
      throw new AuthError(result.reason, otpReasonMessage(result.reason), 400)
    }

    user.is_verified = true
    user.last_login_at = new Date()
    await user.save()

    await logAuthAttempt({
      user_id: user._id,
      otp_id: result.otp._id,
      type: 'verify',
      status: 'success',
      channel: input.channel,
      target: input.target,
      device: input.device,
    })

    return issueTokens(user, input.device)
  }
}

export default RegisterVerifyUseCase
