import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Aligne les plans RESI Pro et RESI Pro+ sur le catalogue des offres.
 *
 *     node ace plans:sync
 *
 * Nom, accroche, prix, durée et fonctions listées sont réécrits d'après
 * `PLAN_CATALOG` ; un palier sans plan en reçoit un. Les abonnements en cours
 * ne bougent pas : chacun a figé son palier et son montant à la souscription.
 *
 * Idempotente. Réécrit ce qu'un administrateur aurait changé depuis le
 * backoffice : c'est le but, le catalogue faisant référence.
 */
export default class SyncPlans extends BaseCommand {
  static commandName = 'plans:sync'
  static description = 'Aligne les plans Pro et Pro+ sur le catalogue des offres RESI'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: Plan } = await import('#models/plan')
    const { PLAN_CATALOG, planToSync } = await import('#features/plans/plan_catalog')

    const plans = await Plan.findAll()

    for (const entry of PLAN_CATALOG) {
      const fields = {
        name: entry.name,
        description: entry.description,
        price: entry.price,
        duration_days: entry.duration_days,
        features: entry.features,
        tier: entry.tier,
        is_active: true,
      }

      const existing = planToSync(plans, entry.tier)
      if (existing) {
        await Plan.findByIdAndUpdate(existing._id, fields)
        this.logger.info(`${entry.name} mis à jour (${existing._id}).`)
      } else {
        // `max_residences` n'est appliqué nulle part : la valeur ne sert qu'au
        // validateur du backoffice, qui l'exige positive.
        const created = await Plan.create({ ...fields, max_residences: 100 })
        this.logger.info(`${entry.name} créé (${created._id}).`)
      }
    }
  }
}
