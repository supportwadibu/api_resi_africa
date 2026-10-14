import { DomainError } from '#utils/domain_error'

import type { SubscriptionStatus } from '#utils/enums/subscription_status'

const DAY_MS = 24 * 60 * 60 * 1000

/** Borne d'une prolongation : au-delà, c'est un abonnement à souscrire. */
export const MAX_EXTENSION_DAYS = 365

export interface ExtendableSubscription {
  status: SubscriptionStatus
  is_trial: boolean
  end_date: Date
}

/**
 * Nouvelles échéances d'un abonnement prolongé par un administrateur.
 *
 * Seul un abonnement en cours — payant ou essai — se prolonge. Un abonnement
 * échu ou annulé n'est pas rouvert par ce biais : il faudrait sinon décider de
 * son palier et de son montant, ce qui est une souscription, pas un geste
 * commercial. Un `pending` n'a pas été payé et n'ouvre rien à prolonger.
 *
 * Les jours s'ajoutent à l'échéance en cours. Si elle est déjà passée sans que
 * le cron ait basculé le statut, ils partent de maintenant : prolonger de
 * 7 jours un abonnement échu d'hier doit rendre 7 jours, pas 6.
 *
 * Pour un essai, `trial_ends_at` suit : les deux dates disent la même chose et
 * l'écran d'essai du mobile lit la seconde.
 */
export function planExtension(
  subscription: ExtendableSubscription,
  days: number,
  now: Date = new Date()
): { end_date: Date; trial_ends_at?: Date } {
  if (subscription.status !== 'active' && subscription.status !== 'trial') {
    throw new DomainError(
      'subscription_not_active',
      'Seul un abonnement en cours peut être prolongé.',
      409
    )
  }
  if (!Number.isInteger(days) || days < 1 || days > MAX_EXTENSION_DAYS) {
    throw new DomainError(
      'invalid_extension_days',
      `La prolongation doit être comprise entre 1 et ${MAX_EXTENSION_DAYS} jours.`,
      422
    )
  }

  const from = Math.max(subscription.end_date.getTime(), now.getTime())
  const endDate = new Date(from + days * DAY_MS)

  const isTrial = subscription.is_trial || subscription.status === 'trial'
  return isTrial ? { end_date: endDate, trial_ends_at: endDate } : { end_date: endDate }
}
