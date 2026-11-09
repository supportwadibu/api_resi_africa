import type { PasswordForgotInput, PasswordForgotOutput } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import { generateAndSendOtp } from '#auth/helpers/otp_dispatch'
import { resetChannel, resetRefusal } from '#auth/helpers/password_reset'
import { assertRateLimit } from '#auth/helpers/rate_limit'
import User from '#models/user'
import logger from '@adonisjs/core/services/logger'

/**
 * Use case : envoie un code de réinitialisation du mot de passe.
 *
 * Par téléphone, le code part sur WhatsApp par le fournisseur hébergé (DUGU
 * Sender) quand il est configuré — même chemin que le code d'inscription,
 * `generateAndSendOtp` le choisit. Par e-mail sinon.
 *
 * La réponse ne dit jamais si le compte existe : la route est publique, et
 * une réponse différente suffirait à dresser la liste des numéros inscrits.
 * Un refus est seulement tracé, ce qui le fait aussi compter dans
 * `assertRateLimit`. Ni le contenu ni la durée de la réponse ne doivent le
 * trahir non plus :
 * - par défaut, l'envoi part sans être attendu — un compte existant, qui
 *   attendrait WhatsApp, répondrait sinon plus lentement qu'un numéro inconnu ;
 * - un échec d'envoi est journalisé (`generateAndSendOtp` le trace déjà),
 *   jamais renvoyé : un 502 n'arriverait que pour un compte existant.
 *
 * `waitForDelivery` n'est vrai que hors production, pour rendre le code en
 * clair aux tests (`dev_otp_code`).
 */
export class PasswordForgotUseCase {
  async execute(
    input: PasswordForgotInput,
    options: { waitForDelivery?: boolean } = {}
  ): Promise<PasswordForgotOutput> {
    await assertRateLimit(input.identifier, 'generate')

    const channel = resetChannel(input.identifier)
    const user = await User.findOne(
      channel === 'email' ? { email: input.identifier } : { phone: input.identifier }
    )
    const refusal = resetRefusal(user?.raw ?? null)

    if (!user || refusal) {
      await logAuthAttempt({
        user_id: user?._id,
        type: 'generate',
        status: 'failed',
        channel,
        target: input.identifier,
        failure_reason: refusal ?? 'user_not_found',
        device: input.device,
      })
      return { channel, plain_code: null }
    }

    const delivery = generateAndSendOtp({
      userId: user._id,
      channel,
      target: input.identifier,
      purpose: 'reset',
      device: input.device,
    }).catch((error) => {
      logger.error({ err: error, user_id: user._id }, 'Échec d’envoi du code de réinitialisation')
      return null
    })

    if (!options.waitForDelivery) return { channel, plain_code: null }
    return { channel, plain_code: await delivery }
  }
}

export default PasswordForgotUseCase
