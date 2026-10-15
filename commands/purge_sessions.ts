import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Supprime les sessions d'authentification expirées.
 *
 * Mongo purgeait via un index TTL. L'équivalent Firestore — une TTL policy sur
 * `expires_at` — exige le plan Blaze, que le projet n'a pas : la purge est donc
 * assurée par cette commande, à planifier (cron, Cloud Scheduler).
 *
 * Sans elle, les sessions expirées s'accumulent indéfiniment. Elles ne posent
 * pas de risque de sécurité — `refresh_tokens.use_case` rejette toute session
 * dont `expires_at` est dépassé — mais gonflent la collection et son coût.
 *
 * Dès que la facturation sera activée, rétablir le `fieldOverrides` avec
 * `"ttl": true` dans `firestore.indexes.json` et retirer cette commande.
 */
export default class PurgeSessions extends BaseCommand {
  static commandName = 'purge:sessions'
  static description = 'Supprime les sessions d’authentification expirées'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { PurgeExpiredSessionsUseCase } =
      await import('#features/users/use_cases/purge_expired_sessions.use_case')

    const result = await new PurgeExpiredSessionsUseCase().execute()

    this.logger.info(
      result.deleted > 0
        ? `${result.deleted} session(s) expirée(s) supprimée(s).`
        : 'Aucune session à purger.'
    )
  }
}
