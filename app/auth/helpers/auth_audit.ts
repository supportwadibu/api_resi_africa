/* eslint-disable prettier/prettier */
import type { DeviceContext } from '#auth/dto/index'
import AuthAttempt, {
  type AuthAttemptStatus,
  type AuthAttemptType,
} from '#models/auth_attempt'
import type { AuthChannel } from '#models/user'

export interface LogAttemptInput {
  user_id?: string | null
  otp_id?: string | null
  type: AuthAttemptType
  status: AuthAttemptStatus
  channel: AuthChannel
  target: string
  failure_reason?: string | null
  device: DeviceContext
}

/**
 * Trace une tentative d'auth (génération/vérification OTP, login).
 * Sert au rate-limit et à l'audit de sécurité.
 */
export async function logAuthAttempt(input: LogAttemptInput): Promise<void> {
  await AuthAttempt.create({
    user_id: input.user_id ?? null,
    otp_id: input.otp_id ?? null,
    type: input.type,
    status: input.status,
    channel: input.channel,
    target: input.target,
    failure_reason: input.failure_reason ?? null,
    ip_address: input.device.ip_address,
    user_agent: input.device.user_agent,
  })
}
