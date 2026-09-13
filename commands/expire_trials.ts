import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Clôture les essais gratuits arrivés à échéance.
 *
 * À planifier une fois par jour (Render Cron Job, Cloud Scheduler) :
 *
 *     node ace subscriptions:expire-trials
 *
 * La fréquence n'a pas besoin d'être fine : un essai clos quelques heures après
 * son terme ne change rien pour le propriétaire, et la commande est idempotente
 * — la relancer ne suspend jamais deux fois le même compte.
 *
 * Sans cette exécution périodique, les essais échus restent `trial` et aucun
 * propriétaire n'est jamais suspendu : la règle des 14 jours devient lettre
 * morte.
 */
export default class ExpireTrials extends BaseCommand {
  static commandName = 'subscriptions:expire-trials'
  static description = 'Expire les essais gratuits échus et suspend les propriétaires non validés'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { SuspendUnverifiedOwnersUseCase } =
      await import('#features/subscriptions/use_cases/suspend_unverified_owners.use_case')

    const result = await new SuspendUnverifiedOwnersUseCase().execute()

    if (result.expired === 0) {
      this.logger.info('Aucun essai arrivé à échéance.')
      return
    }

    this.logger.info(
      `${result.expired} essai(s) expiré(s) — ` +
        `${result.suspended} compte(s) suspendu(s), ` +
        `${result.kept_active} propriétaire(s) validé(s) épargné(s).`
    )
  }
}
