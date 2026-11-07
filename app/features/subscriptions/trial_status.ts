import { readPaidPlanTier, type PaidPlanTier } from '#features/plans/plan_tier'
import type { SubscriptionStatus } from '#utils/enums/subscription_status'

export interface TrialStatusSubscription {
  is_trial: boolean
  status: SubscriptionStatus
  plan_tier?: string | null
  end_date: Date
}

export interface TrialStatus {
  /**
   * Le propriétaire n'a encore rien essayé ni souscrit : l'application le
   * retient sur l'écran de choix du palier d'essai.
   */
  trial_choice_required: boolean
  /**
   * Palier de l'essai, une fois celui-ci terminé, tant qu'aucun abonnement
   * n'a pris le relais : l'application propose alors de le continuer ou de
   * changer de forfait. `null` sinon.
   */
  ended_trial_tier: PaidPlanTier | null
}

/**
 * Où en est le propriétaire avec son essai, lu dans tout son historique
 * d'abonnements.
 *
 * Un essai échu n'est plus renvoyé comme abonnement en cours : sans ce
 * calcul, l'application ne saurait pas quel palier proposer à sa fin.
 */
export function trialStatus(
  history: TrialStatusSubscription[],
  ownerStatus: string | null,
  now: Date = new Date()
): TrialStatus {
  // Même règle que `StartTrialForOwnerUseCase` : un compte rejeté ou suspendu
  // n'ouvre pas d'essai, inutile de lui en proposer un.
  const canTry = ownerStatus !== null && ownerStatus !== 'rejected' && ownerStatus !== 'suspended'

  const trial = history.find((s) => s.is_trial)
  const paidAfter = history.some((s) => !s.is_trial)
  // L'échéance est comparée ici, comme dans `resolvePlanAccess` : un essai échu
  // que le cron n'a pas encore basculé est déjà terminé pour le propriétaire.
  const ended =
    trial !== undefined &&
    (trial.end_date.getTime() <= now.getTime() ||
      (trial.status !== 'trial' && trial.status !== 'active'))

  return {
    trial_choice_required: history.length === 0 && canTry,
    // Un essai sans palier a été ouvert avant le choix : il ouvrait Pro+.
    ended_trial_tier: trial && ended && !paidAfter ? readPaidPlanTier(trial.plan_tier) : null,
  }
}
