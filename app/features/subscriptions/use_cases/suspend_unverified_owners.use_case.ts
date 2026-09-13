import Subscription from '#models/subscription'
import SubscriptionEvent from '#models/subscription_event'
import { SubscriptionStatusEnum } from '#utils/enums/subscription_status'
import logger from '@adonisjs/core/services/logger'

import OwnerRepository from '../../owners/repositories/owner_repository.ts'

export interface SuspendUnverifiedOwnersResult {
  /** Essais arrivés à échéance et basculés en `expired`. */
  expired: number
  /** Propriétaires passés en `suspended` faute de validation. */
  suspended: number
  /** Essais échus dont le propriétaire était validé : aucune sanction. */
  kept_active: number
}

/**
 * Clôture les essais gratuits arrivés à échéance.
 *
 * Deux issues selon l'état du dossier au moment où l'essai s'achève :
 *
 *  - dossier validé (`owner_status: 'active'`) — l'essai expire, rien d'autre.
 *    Le propriétaire souscrira un plan payant quand il le souhaitera.
 *  - dossier non validé — l'essai expire *et* le compte passe `suspended`.
 *
 * La suspension ne touche jamais `is_active` : le propriétaire garde l'accès à
 * son compte pour régulariser son dossier. Sans cela, un compte devenu
 * inaccessible ne pourrait plus jamais être rattrapé sans un admin.
 *
 * L'opération est idempotente — un essai déjà `expired` n'est plus candidat —
 * ce qui permet de la rejouer sans risque après un échec partiel.
 */
export class SuspendUnverifiedOwnersUseCase {
  constructor(private owners: OwnerRepository = new OwnerRepository()) {}

  async execute(): Promise<SuspendUnverifiedOwnersResult> {
    // Les essais échus sont lus *avant* l'expiration en masse : une fois
    // basculés en `expired`, ils sortiraient du périmètre de `findOverdue`
    // et l'on ne saurait plus quels propriétaires sanctionner.
    const allOverdue = await Subscription.findOverdue()
    const overdue = allOverdue.filter((s) => s.is_trial)

    if (overdue.length === 0) {
      return { expired: 0, suspended: 0, kept_active: 0 }
    }

    const expired = await Subscription.expireOverdue()

    let suspended = 0
    let keptActive = 0

    for (const subscription of overdue) {
      // Un échec isolé ne doit pas interrompre le lot : le propriétaire suivant
      // n'a pas à pâtir d'un document corrompu ou d'une écriture refusée.
      try {
        const owner = await this.owners.findById(subscription.user_id)

        // Compte disparu ou changé de rôle : plus rien à suspendre.
        if (!owner) continue

        if (owner.owner_status === 'active') {
          keptActive += 1
          await this.log(subscription, 'trial_ended', 'Essai gratuit arrivé à échéance.')
          continue
        }

        // `rejected` est déjà terminal : le repasser en `suspended` effacerait
        // le motif du rejet, plus informatif pour l'admin comme pour le support.
        if (owner.owner_status === 'rejected') {
          await this.log(subscription, 'trial_ended', 'Essai échu sur un dossier rejeté.')
          continue
        }

        if (owner.owner_status !== 'suspended') {
          await this.owners.markSuspended(subscription.user_id)
        }

        suspended += 1
        await this.log(
          subscription,
          'suspended',
          'Compte suspendu : essai gratuit écoulé sans validation du dossier.'
        )
      } catch (error) {
        logger.error(
          { err: error, user_id: subscription.user_id, subscription_id: subscription._id },
          "Échec de la suspension d'un propriétaire en fin d'essai"
        )
      }
    }

    return { expired, suspended, kept_active: keptActive }
  }

  private async log(
    subscription: { _id: string; user_id: string; status: string },
    eventType: 'trial_ended' | 'suspended',
    description: string
  ): Promise<void> {
    await SubscriptionEvent.create({
      user_id: subscription.user_id,
      subscription_id: subscription._id,
      event_type: eventType,
      description,
      previous_status: subscription.status,
      new_status: SubscriptionStatusEnum.EXPIRED,
      triggered_by: 'system',
    })
  }
}

export default SuspendUnverifiedOwnersUseCase
