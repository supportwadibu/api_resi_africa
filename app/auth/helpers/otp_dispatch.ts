import type { DeviceContext } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import type { OtpChannel, OtpPurpose } from '#models/otp_code'
/* eslint-disable prettier/prettier */
import NotificationService from '#services/notification_service'
import OtpService from '#services/otp_service'
import { AuthError } from '#utils/auth_error'

export interface GenerateAndSendOtpInput {
  userId: string
  /**
   * Canal de *livraison* du code : email ou SMS/WhatsApp uniquement.
   * Volontairement plus étroit que `AuthChannel`, qui inclut les providers
   * externes (google) vers lesquels aucun OTP ne peut être envoyé.
   */
  channel: OtpChannel
  target: string
  purpose: OtpPurpose
  device: DeviceContext
}

/**
 * Génère un OTP, l'envoie via le canal (email/SMS/WhatsApp) puis trace
 * la tentative. En cas d'échec d'envoi, le code est journalisé `failed`
 * et une AuthError('otp_send_failed', 502) est levée.
 */
export async function generateAndSendOtp(
  input: GenerateAndSendOtpInput
): Promise<string> {
  const { otp, plainCode } = await OtpService.generate({
    userId: input.userId,
    channel: input.channel,
    target: input.target,
    purpose: input.purpose,
  })

  try {
    await NotificationService.sendOtp({
      channel: input.channel,
      target: input.target,
      code: plainCode,
      purpose: input.purpose,
    })
  } catch (error) {
    await logAuthAttempt({
      user_id: input.userId,
      otp_id: otp._id,
      type: 'generate',
      status: 'failed',
      channel: input.channel,
      target: input.target,
      failure_reason: `send_failed: ${(error as Error).message}`,
      device: input.device,
    })
    throw new AuthError(
      'otp_send_failed',
      "Impossible d'envoyer le code de vérification. Réessayez dans un instant.",
      502
    )
  }

  await logAuthAttempt({
    user_id: input.userId,
    otp_id: otp._id,
    type: 'generate',
    status: 'success',
    channel: input.channel,
    target: input.target,
    device: input.device,
  })

  return plainCode
}
