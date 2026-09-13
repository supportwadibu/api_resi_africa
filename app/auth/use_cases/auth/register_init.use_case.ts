import HashService from '#services/hash_service'
import Role from '#models/role'
import User from '#models/user'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { generateAndSendOtp } from '#auth/helpers/otp_dispatch'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import { AuthError } from '#utils/auth_error'
import type { RegisterInitInput, RegisterInitOutput } from '#auth/dto/index'

/**
 * Use case : démarre l'inscription d'un nouvel utilisateur.
 * - Vérifie le rate-limit
 * - Vérifie l'unicité email/phone
 * - Si user non vérifié existe déjà : régénère et renvoie l'OTP
 * - Sinon : crée le user inactif puis envoie l'OTP
 */
export class RegisterInitUseCase {
  async execute(input: RegisterInitInput): Promise<RegisterInitOutput> {
    const target = input.auth_channel === 'email' ? input.email : input.phone
    if (!target) {
      throw new AuthError(
        'missing_target',
        `Le champ ${input.auth_channel} est requis pour ce canal d'authentification.`
      )
    }

    await assertRateLimit(target, 'generate')

    // Firestore ne sait pas exprimer un OU portant sur deux champs distincts :
    // on interroge chaque identifiant séparément.
    const existing =
      (input.email ? await User.findOne({ email: input.email }) : null) ??
      (input.phone ? await User.findOne({ phone: input.phone }) : null)

    if (existing) {
      if (existing.is_verified) {
        await logAuthAttempt({
          type: 'generate',
          status: 'failed',
          channel: input.auth_channel,
          target,
          failure_reason: 'already_registered',
          device: input.device,
        })
        throw new AuthError('already_registered', 'Un compte existe déjà.', 409)
      }

      const plainCode = await generateAndSendOtp({
        userId: existing._id,
        channel: input.auth_channel,
        target,
        purpose: 'register',
        device: input.device,
      })

      return {
        user_id: existing._id,
        otp_target: target,
        plain_code: plainCode,
      }
    }

    const role = await Role.findOne({ name: input.role_name })
    if (!role) {
      throw new AuthError('role_not_found', `Le rôle "${input.role_name}" n'existe pas.`)
    }

    const passwordHash = await HashService.make(input.password)

    const user = await User.create({
      // L'identifiant du document rôle est son nom (cf. `#models/role`).
      role_id: role.name,
      full_name: input.full_name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      auth_channel: input.auth_channel,
      password: passwordHash,
      is_verified: false,
      is_active: true,
    })

    const plainCode = await generateAndSendOtp({
      userId: user._id,
      channel: input.auth_channel,
      target,
      purpose: 'register',
      device: input.device,
    })

    return {
      user_id: user._id,
      otp_target: target,
      plain_code: plainCode,
    }
  }
}

export default RegisterInitUseCase
