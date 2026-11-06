import crypto from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import OtpCode, {
  OTP_DEFAULT_MAX_ATTEMPTS,
  OTP_DEFAULT_TTL_SECONDS,
  type OtpChannel,
  type OtpCodeRecord,
  type OtpPurpose,
} from '#models/otp_code'
import HashService from '#services/hash_service'
import NotificationService from '#services/notification_service'
import type { DeliveryChannel, HostedOtpProvider } from '#services/notifications/messaging/types'
import { AuthError } from '#utils/auth_error'

export interface GenerateOtpInput {
  userId: string
  channel: OtpChannel
  target: string
  purpose: OtpPurpose
}

export interface OtpGenerationResult {
  otp: OtpCodeRecord
  /**
   * Code en clair (jamais persisté). `null` quand le fournisseur garde le
   * code et ne le rend pas — toujours, sauf avec une clé de test.
   */
  plainCode: string | null
}

export type OtpVerifyFailure = 'not_found' | 'expired' | 'max_attempts' | 'invalid_code'

export class OtpService {
  /** Génère un code numérique à 6 chiffres en clair. */
  static generatePlainCode(): string {
    // 6 chiffres uniformément distribués
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  }

  /**
   * Crée un nouvel OTP.
   *
   * L'invalidation des codes précédents est implicite : le couple
   * (utilisateur, usage) sert de clé de stockage, donc l'écriture remplace
   * l'éventuel code actif.
   */
  static async generate(
    input: GenerateOtpInput
  ): Promise<OtpGenerationResult & { plainCode: string }> {
    const plainCode = this.generatePlainCode()
    const codeHash = await HashService.make(plainCode)

    const otp = await OtpCode.create({
      user_id: input.userId,
      code: codeHash,
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      expires_at: new Date(Date.now() + OTP_DEFAULT_TTL_SECONDS * 1000),
      max_attempts: OTP_DEFAULT_MAX_ATTEMPTS,
    })

    return { otp, plainCode }
  }

  /**
   * Fait générer et envoyer le code par le fournisseur, puis garde son
   * identifiant à la place du hash.
   *
   * L'enregistrement local reste nécessaire : la vérification part de
   * (utilisateur, usage), que le fournisseur ignore, et la limite d'essais de
   * RESI s'applique avant tout appel sortant. La durée et le nombre d'essais
   * sont ceux du fournisseur : plus généreux en local, l'usager verrait un
   * code encore « valide » que le fournisseur refuse.
   */
  static async requestHosted(
    provider: HostedOtpProvider,
    input: GenerateOtpInput & { deliveryChannel: DeliveryChannel }
  ): Promise<OtpGenerationResult> {
    const issued = await provider.requestOtp({
      to: input.target,
      channel: input.deliveryChannel,
      purpose: input.purpose,
      intent: input.purpose === 'register' ? 'verification_phone' : 'security',
    })

    const otp = await OtpCode.create({
      user_id: input.userId,
      code: null,
      external_id: issued.externalId,
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      expires_at: issued.expiresAt,
      max_attempts: issued.maxAttempts,
    })

    return { otp, plainCode: issued.testCode }
  }

  /**
   * Vérifie un code OTP. Retourne le document OTP si valide, sinon une raison d'échec.
   */
  static async verify(input: {
    userId: string
    purpose: OtpPurpose
    plainCode: string
  }): Promise<{ ok: true; otp: OtpCodeRecord } | { ok: false; reason: OtpVerifyFailure }> {
    const otp = await OtpCode.findActive(input.userId, input.purpose)

    if (!otp) {
      return { ok: false, reason: 'not_found' }
    }

    if (otp.expires_at.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' }
    }

    if (otp.attempts_count >= otp.max_attempts) {
      return { ok: false, reason: 'max_attempts' }
    }

    // Le compteur est incrémenté avant la comparaison : si la vérification
    // échoue ou lève, la tentative reste comptabilisée. L'incrémenter après
    // ouvrirait une fenêtre d'essais illimités en cas d'erreur.
    const attempts = await OtpCode.incrementAttempts(input.userId, input.purpose)

    const failure = otp.external_id
      ? await this.verifyHosted(otp, otp.external_id, input.plainCode)
      : await this.verifyLocal(otp, input.plainCode)
    if (failure) {
      return { ok: false, reason: failure }
    }

    await OtpCode.markUsed(input.userId, input.purpose)

    return {
      ok: true,
      otp: { ...otp, attempts_count: attempts, is_used: true, used_at: new Date() },
    }
  }

  private static async verifyLocal(
    otp: OtpCodeRecord,
    plainCode: string
  ): Promise<OtpVerifyFailure | null> {
    // Un code sans hash ni identifiant externe ne peut correspondre à rien.
    if (!otp.code) return 'not_found'
    return (await HashService.verify(plainCode, otp.code)) ? null : 'invalid_code'
  }

  private static async verifyHosted(
    otp: OtpCodeRecord,
    externalId: string,
    plainCode: string
  ): Promise<OtpVerifyFailure | null> {
    const provider = NotificationService.getHostedOtpProvider()
    if (!provider) {
      // Fournisseur changé entre l'envoi et la saisie : seul l'ancien saurait
      // vérifier ce code. L'usager en redemande un.
      logger.warn(
        { user_id: otp.user_id, purpose: otp.purpose },
        'OTP émis par un fournisseur qui n’est plus configuré'
      )
      return 'not_found'
    }

    try {
      const result = await provider.verifyOtp(externalId, plainCode)
      return result.ok ? null : result.reason
    } catch (error) {
      // Rien ne dit que le code est faux : répondre `invalid_code` ferait
      // ressaisir un bon code. La tentative reste comptée, comme toute
      // vérification qui lève.
      logger.error({ err: error, purpose: otp.purpose }, "Échec de vérification de l'OTP")
      throw new AuthError(
        'otp_verify_failed',
        'Impossible de vérifier le code pour le moment. Réessayez dans un instant.',
        502
      )
    }
  }
}

export default OtpService
