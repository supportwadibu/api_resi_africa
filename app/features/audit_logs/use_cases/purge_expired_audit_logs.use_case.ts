import AuditLog from '#models/audit_log'

/**
 * Supprime les traces d'audit arrivées à échéance (`expires_at`).
 *
 * Une politique TTL de Firestore ferait ce travail seule, mais elle exige un
 * projet dont la facturation est activée : tant que ce n'est pas le cas, la
 * purge est une tâche planifiée, comme celle des sessions. Idempotente :
 * boucler jusqu'à épuisement garantit une purge complète.
 */
export class PurgeExpiredAuditLogsUseCase {
  async execute(): Promise<{ deleted: number }> {
    let total = 0
    let deleted: number

    do {
      deleted = await AuditLog.deleteExpired()
      total += deleted
    } while (deleted > 0)

    return { deleted: total }
  }
}

export default PurgeExpiredAuditLogsUseCase
