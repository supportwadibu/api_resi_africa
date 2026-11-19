import { roleNameOf } from '#auth/helpers/pin_rules'
import type { RegisterInitOutput, RegisterResendInput } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { generateAndSendOtp } from '#auth/helpers/otp_dispatch'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import { otpDelivery } from '#auth/helpers/password_reset'
import User from '#models/user'
import { AuthError } from '#utils/auth_error'

/**
 * Use case : renvoie le code d'une inscription pas encore vérifiée.
 *
 * Le nouveau code remplace le précédent (un seul OTP actif par utilisateur et
 * par objet). Le renvoi compte dans la même limite que le premier envoi : il
 * ne doit pas ouvrir un second guichet pour inonder une boîte ou un numéro.
 */
export class RegisterResendUseCase {
  async execute(input: RegisterResendInput): Promise<RegisterInitOutput> {
    await assertRateLimit(input.target, 'generate')

    const query = input.channel === 'email' ? { email: input.target } : { phone: input.target }
    const user = await User.findOne(query)

    // Les refus sont tracés comme ceux de `register/init` : sans trace, ils
    // échapperaient à `assertRateLimit`, et la route se laisserait interroger
    // sans fin. L'existence d'un compte n'est pas un secret de plus qu'à
    // l'inscription, qui répond déjà `already_registered`.
    if (!user || user.is_verified) {
      await logAuthAttempt({
        type: 'generate',
        status: 'failed',
        channel: input.channel,
        target: input.target,
        failure_reason: user ? 'already_registered' : 'registration_not_found',
        device: input.device,
      })
    }
    if (!user) {
      throw new AuthError(
        'registration_not_found',
        'Aucune inscription en attente pour cette adresse. Recommencez l’inscription.',
        404
      )
    }
    if (user.is_verified) {
      throw new AuthError('already_registered', 'Un compte existe déjà.', 409)
    }

    // Client inscrit par e-mail : le code part à son adresse (`otpDelivery`).
    const roleName = await roleNameOf(user.role_id)
    const delivery = otpDelivery(user, roleName, { channel: input.channel, target: input.target })

    const plainCode = await generateAndSendOtp({
      userId: user._id,
      ...delivery,
      purpose: 'register',
      device: input.device,
    })

    return { user_id: user._id, otp_target: input.target, plain_code: plainCode }
  }
}

export default RegisterResendUseCase
