import type { SubscriptionStatus } from '#utils/enums/subscription_status'
import type { PlanTier } from '#features/plans/plan_tier'

/**
 * DTO d'entrée/sortie pour les usecases Subscription.
 * Le format de retour est primitivisé (string IDs, Date) afin d'être
 * directement sérialisable JSON.
 */

export interface SubscriptionDto {
  id: string
  user_id: string
  plan_id: string | null
  is_trial: boolean
  status: SubscriptionStatus
  amount: number
  /** Toujours renseigné : `full` pour un essai et pour l'historique sans palier. */
  plan_tier: PlanTier
  start_date: Date
  end_date: Date
  trial_ends_at: Date | null
  payment_reference: string | null
  auto_renew: boolean
  cancelled_at: Date | null
  cancel_reason: string | null
  /** Valeur d'un jour de la période ; `null` sur l'historique. */
  daily_value: number | null
  /** Rendu au portefeuille à la résiliation ; `null` sinon. */
  refunded_amount: number | null
  created_at: Date
  updated_at: Date
}

/**
 * Ce que le propriétaire peut faire de son forfait en cours, chiffré par le
 * serveur : l'écran annonce les montants exacts qui seront débités ou rendus.
 */
export interface SubscriptionOptionsDto {
  /** Le renouvellement est ouvert (7 jours avant l'échéance, ou rien à renouveler). */
  renewable: boolean
  /** Un forfait payant est en cours : il peut être résilié. */
  cancellable: boolean
  /** Rendu au portefeuille en cas de résiliation maintenant. */
  refund_amount: number
  /** Jours payés restants, sans le jour en cours. */
  remaining_days: number
  /** Montées possibles, au prix réduit des jours restants. */
  upgrades: Array<{ plan_id: string; plan_tier: PlanTier; price: number; amount: number }>
}

export interface StartTrialInput {
  user_id: string
  duration_days?: number
}

export interface SubscribeToPlanInput {
  user_id: string
  plan_id: string
  payment_reference?: string | null
  auto_renew?: boolean
}

export interface CancelSubscriptionInput {
  subscription_id: string
  reason?: string
}

export interface ListSubscriptionsInput {
  status?: SubscriptionStatus
  user_id?: string
  is_trial?: boolean
  page?: number
  per_page?: number
}

export interface ListSubscriptionsOutput {
  data: SubscriptionDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
