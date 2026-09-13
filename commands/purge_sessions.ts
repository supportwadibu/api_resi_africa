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
    const { default: AuthSession } = await import('#models/auth_session')

    // `deleteExpired` traite un lot de 500 (limite d'un batch Firestore) ; on
    // boucle jusqu'à épuisement pour purger l'arriéré en une seule exécution.
    let total = 0
    let deleted: number
    do {
      deleted = await AuthSession.deleteExpired()
      total += deleted
    } while (deleted > 0)

    this.logger.info(
      total > 0 ? `${total} session(s) expirée(s) supprimée(s).` : 'Aucune session à purger.'
    )
  }
}
