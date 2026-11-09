import { AuthError } from '#utils/auth_error'

import type { UserEntity } from '#models/user'

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Abidjan',
})

/**
 * Refuse la connexion d'un compte dont le titulaire a demandé la suppression.
 *
 * À appeler avant le contrôle `is_active` : sans lui, l'utilisateur lirait
 * « Compte désactivé » et croirait à une sanction, sans savoir que la
 * suppression qu'il a demandée peut encore être annulée par le support.
 */
export function assertNotPendingDeletion(user: UserEntity): void {
  const purgeAt = user.raw.is_deleted ? user.raw.purge_scheduled_at : null
  if (!purgeAt) return
  throw new AuthError(
    'account_deletion_pending',
    `Ce compte est en cours de suppression. Pour l'annuler, contactez le support avant le ${DATE_FORMATTER.format(purgeAt)}.`,
    403
  )
}
