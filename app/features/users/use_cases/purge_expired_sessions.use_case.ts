import AuthSession from '#models/auth_session'

/**
 * Purge les sessions d'authentification expirées dans Firestore.
 *
 * Firestore n'ayant pas de politique TTL sur le plan gratuit, cette tâche
 * supprime par lots de 500 les sessions dont la date d'expiration est dépassée.
 * Idempotente : boucler jusqu'à épuisement garantit une purge complète.
 */
export class PurgeExpiredSessionsUseCase {
  async execute(): Promise<{ deleted: number }> {
    let total = 0
    let deleted: number

    do {
      deleted = await AuthSession.deleteExpired()
      total += deleted
    } while (deleted > 0)

    return { deleted: total }
  }
}
