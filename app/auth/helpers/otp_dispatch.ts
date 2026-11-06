import logger from '@adonisjs/core/services/logger'

import type { DeviceContext } from '#auth/dto/index'
import { logAuthAttempt } from '#auth/helpers/auth_audit'
import type { OtpChannel, OtpPurpose } from '#models/otp_code'
import NotificationService from '#services/notification_service'
import { type HostedOtpProvider, MessagingError } from '#services/notifications/messaging/types'
import OtpService, { type OtpGenerationResult } from '#services/otp_service'
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
 *
 * Rend le code en clair pour `dev_otp_code`, ou `null` quand le fournisseur
 * le garde (clé de production DUGU).
 */
export async function generateAndSendOtp(input: GenerateAndSendOtpInput): Promise<string | null> {
  const hosted = input.channel === 'phone' ? NotificationService.getHostedOtpProvider() : null
  const { otp, plainCode } = hosted ? await requestHosted(hosted, input) : await sendLocal(input)

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

/** RESI génère le code et le confie au fournisseur email ou téléphone. */
async function sendLocal(input: GenerateAndSendOtpInput): Promise<OtpGenerationResult> {
  const generated = await OtpService.generate({
    userId: input.userId,
    channel: input.channel,
    target: input.target,
    purpose: input.purpose,
  })

  try {
    await NotificationService.sendOtp({
      channel: input.channel,
      target: input.target,
      code: generated.plainCode,
      purpose: input.purpose,
    })
  } catch (error) {
    return failSend(input, error, generated.otp._id)
  }
  return generated
}

/** Le fournisseur génère, envoie et gardera le code (DUGU Sender). */
async function requestHosted(
  provider: HostedOtpProvider,
  input: GenerateAndSendOtpInput
): Promise<OtpGenerationResult> {
  try {
    return await OtpService.requestHosted(provider, {
      userId: input.userId,
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      deliveryChannel: NotificationService.resolvePhoneChannel(),
    })
  } catch (error) {
    return failSend(input, error)
  }
}

async function failSend(
  input: GenerateAndSendOtpInput,
  error: unknown,
  otpId?: string
): Promise<never> {
  // L'AuthError renvoyée au client masque la cause ; sans ce log, une clé
  // révoquée ou un domaine non vérifié ne se lirait que dans la RTDB.
  logger.error(
    { err: error, channel: input.channel, purpose: input.purpose },
    "Échec d'envoi de l'OTP"
  )
  await logAuthAttempt({
    user_id: input.userId,
    ...(otpId ? { otp_id: otpId } : {}),
    type: 'generate',
    status: 'failed',
    channel: input.channel,
    target: input.target,
    failure_reason: `send_failed: ${(error as Error).message}`,
    device: input.device,
  })

  // Un numéro que le fournisseur ne dessert pas échouerait pareil au prochain
  // essai : « réessayez » enverrait l'usager tourner en rond.
  if (error instanceof MessagingError && error.kind === 'destination_unsupported') {
    throw new AuthError(
      'phone_not_supported',
      "Ce numéro ne peut pas recevoir de code de vérification. Vérifiez l'indicatif ou inscrivez-vous par email.",
      422
    )
  }
  throw new AuthError(
    'otp_send_failed',
    "Impossible d'envoyer le code de vérification. Réessayez dans un instant.",
    502
  )
}
