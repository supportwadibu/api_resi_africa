/* eslint-disable prettier/prettier */
import AuthAttempt, { type AuthAttemptType } from '#models/auth_attempt'
import env from '#start/env'
import { AuthError } from '#utils/auth_error'

const WINDOW_MIN = env.get('OTP_RATE_LIMIT_WINDOW_MINUTES') ?? 15
const MAX = env.get('OTP_RATE_LIMIT_MAX') ?? 5

/**
 * Vérifie qu'un même `target` (email ou phone) n'a pas dépassé
 * le seuil de tentatives sur la fenêtre récente.
 *
 * Lève AuthError('rate_limited', 429) si le seuil est atteint.
 */
export async function assertRateLimit(
  target: string,
  type: AuthAttemptType
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000)
  const count = await AuthAttempt.countSince(target, type, since)
  if (count >= MAX) {
    throw new AuthError(
      'rate_limited',
      `Trop de tentatives. Réessayez dans ${WINDOW_MIN} minutes.`,
      429
    )
  }
}
