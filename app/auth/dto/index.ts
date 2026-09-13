import type { AuthChannel } from '#models/user'
import type { OtpChannel, OtpPurpose } from '#models/otp_code'

/**
 * Contexte de l'appareil/requête, capturé une fois en bordure HTTP
 * et propagé jusqu'aux use cases pour audit + traçage de session.
 */
export interface DeviceContext {
  ip_address: string
  user_agent: string
  device_name?: string | null
  platform?: 'ios' | 'android' | 'web' | 'unknown'
}

export type RoleName = 'admin' | 'proprio' | 'client'

// ---------- Inputs des use cases ----------

export interface RegisterInitInput {
  full_name: string
  email?: string | null
  phone?: string | null
  password: string
  /** Inscription par OTP : email ou phone. Google a son propre use case. */
  auth_channel: OtpChannel
  role_name: RoleName
  device: DeviceContext
}

export interface RegisterVerifyInput {
  channel: OtpChannel
  target: string
  code: string
  device: DeviceContext
}

export interface LoginInput {
  identifier: string
  password: string
  device: DeviceContext
}

/**
 * Connexion/inscription via Google.
 * `id_token` est l'ID token OIDC obtenu côté mobile — jamais l'access token,
 * qui n'est pas vérifiable hors appel réseau et ne prouve pas l'identité.
 */
export interface GoogleLoginInput {
  id_token: string
  device: DeviceContext
}

export interface RefreshTokensInput {
  refresh_token: string
  device: DeviceContext
}

export interface LogoutInput {
  refresh_token: string
  reason?: 'logout' | 'admin'
}

// ---------- Outputs des use cases ----------

export interface RegisterInitOutput {
  user_id: string
  otp_target: string
  plain_code: string
}

export interface AuthTokensOutput {
  access_token: string
  access_token_expires_in: string | number
  refresh_token: string
  refresh_token_expires_in: string | number
  user: {
    id: string
    full_name: string
    email: string | null
    phone: string | null
    role: string
    is_verified: boolean
    avatar_url?: string | null
  }
}

/**
 * Sortie du login Google : les tokens, plus le fait que le compte vienne
 * d'être créé — le mobile s'en sert pour déclencher l'onboarding.
 */
export interface GoogleLoginOutput extends AuthTokensOutput {
  is_new_user: boolean
}

export interface LogoutOutput {
  revoked: boolean
}

// Réexports utilitaires
export type { AuthChannel, OtpChannel, OtpPurpose }
