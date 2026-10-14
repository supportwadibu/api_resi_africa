import crypto from 'node:crypto'
import OtpCode, {
  OTP_DEFAULT_MAX_ATTEMPTS,
  OTP_DEFAULT_TTL_SECONDS,
  type OtpChannel,
  type OtpCodeRecord,
  type OtpPurpose,
} from '#models/otp_code'
import HashService from '#services/hash_service'

export interface GenerateOtpInput {
  userId: string
  channel: OtpChannel
  target: string
  purpose: OtpPurpose
}

export interface OtpGenerationResult {
  otp: OtpCodeRecord
  /** Code en clair à envoyer à l'utilisateur (jamais persisté). */
  plainCode: string
}

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
  static async generate(input: GenerateOtpInput): Promise<OtpGenerationResult> {
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
   * Vérifie un code OTP. Retourne le document OTP si valide, sinon une raison d'échec.
   */
  static async verify(input: {
    userId: string
    purpose: OtpPurpose
    plainCode: string
  }): Promise<
    | { ok: true; otp: OtpCodeRecord }
    | { ok: false; reason: 'not_found' | 'expired' | 'max_attempts' | 'invalid_code' }
  > {
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

    const matches = await HashService.verify(input.plainCode, otp.code)
    if (!matches) {
      return { ok: false, reason: 'invalid_code' }
    }

    await OtpCode.markUsed(input.userId, input.purpose)

    return {
      ok: true,
      otp: { ...otp, attempts_count: attempts, is_used: true, used_at: new Date() },
    }
  }
}

export default OtpService
