import type { OtpChannel } from '#models/otp_code'
import type { UserRecord } from '#models/user'

/** Pourquoi un compte ne peut pas recevoir de code de réinitialisation. */
export type ResetRefusal =
  | 'user_not_found'
  | 'account_not_verified'
  | 'account_disabled'
  | 'account_deletion_pending'

/**
 * Le compte peut-il réinitialiser son mot de passe ?
 *
 * Un compte non vérifié doit d'abord finir son inscription — son code
 * d'inscription est le seul qui l'active. Un compte désactivé par l'équipe,
 * ou dont le titulaire a demandé la suppression, ne doit pas se rouvrir par
 * ce détour : le mot de passe changerait, l'accès resterait fermé, et le
 * message laisserait croire le contraire.
 */
export function resetRefusal(
  user: Pick<UserRecord, 'is_verified' | 'is_active' | 'is_deleted' | 'purge_scheduled_at'> | null
): ResetRefusal | null {
  if (!user) return 'user_not_found'
  if (user.is_deleted && user.purge_scheduled_at) return 'account_deletion_pending'
  if (!user.is_verified) return 'account_not_verified'
  if (!user.is_active || user.is_deleted) return 'account_disabled'
  return null
}

/** Canal d'envoi du code, déduit de l'identifiant comme à la connexion. */
export function resetChannel(identifier: string): OtpChannel {
  return identifier.includes('@') ? 'email' : 'phone'
}
