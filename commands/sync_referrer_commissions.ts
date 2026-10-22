import { BaseCommand } from '@adonisjs/core/ace'

import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Inscrit en dépense la commission d'apporteur de chaque réservation qui n'en
 * a pas encore.
 *
 *     node ace commissions:sync
 *
 * Le relevé financier déduit la commission par sa dépense `commission`. Les
 * réservations enregistrées avant l'introduction de cette dépense n'en ont
 * pas : sans ce rattrapage, leur commission disparaîtrait du bénéfice net.
 *
 * Idempotente : la clé de chaque dépense dérive de la réservation, et une
 * dépense déjà en place n'est pas réécrite. À lancer une fois après le
 * déploiement ; la relancer est sans risque.
 */
export default class SyncReferrerCommissions extends BaseCommand {
  static commandName = 'commissions:sync'
  static description = "Inscrit en dépense les commissions d'apporteur manquantes"

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: Booking } = await import('#models/booking')
    const { syncReferrerCommissionExpense } = await import('#features/bookings/referrer_expense')

    const bookings = await Booking.findWithReferrerCommission()
    let failed = 0

    // En série : le volume est faible, et un parcours parallèle multiplierait
    // les écritures simultanées sans rien faire gagner.
    for (const booking of bookings) {
      try {
        await syncReferrerCommissionExpense(booking)
      } catch (error) {
        failed++
        this.logger.error(`Réservation ${booking._id} : ${(error as Error).message}`)
      }
    }

    this.logger.info(
      `${bookings.length} réservation(s) avec apporteur examinée(s), ${failed} en échec.`
    )
  }
}
