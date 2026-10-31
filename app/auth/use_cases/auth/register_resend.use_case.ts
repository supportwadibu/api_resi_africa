import type { RegisterInitOutput, RegisterResendInput } from '#auth/dto/index'
import { generateAndSendOtp } from '#auth/helpers/otp_dispatch'
import { assertRateLimit } from '#auth/helpers/rate_limit'
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

    const plainCode = await generateAndSendOtp({
      userId: user._id,
      channel: input.channel,
      target: input.target,
      purpose: 'register',
      device: input.device,
    })

    return { user_id: user._id, otp_target: input.target, plain_code: plainCode }
  }
}

export default RegisterResendUseCase
