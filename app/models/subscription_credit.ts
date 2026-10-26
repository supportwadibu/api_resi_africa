import { COLLECTIONS, collection, toDoc, type WithId } from '#firebase/firestore'

/**
 * Crédit d'abonnement bloqué d'un propriétaire.
 *
 * Gardé à la résiliation d'un Pro+ en deuxième semaine (voir
 * `cancellation_policy.ts`) : il ne se retire pas, il se déduit du prochain
 * paiement d'abonnement. Distinct du portefeuille, dont le solde se retire.
 *
 * Un document par propriétaire, d'identifiant son `user_id` : le paiement le
 * relit sans requête ni index, et deux crédits successifs s'additionnent sur
 * la même ligne.
 */
export interface SubscriptionCreditDocument {
  user_id: string
  amount: number
  expires_at: Date
  /** Abonnement dont la résiliation a donné le dernier crédit. */
  source_subscription_id: string | null
  created_at: Date
  updated_at: Date
}

export type SubscriptionCreditRecord = WithId<SubscriptionCreditDocument>

export function subscriptionCredits() {
  return collection<SubscriptionCreditDocument>(COLLECTIONS.subscriptionCredits)
}

const SubscriptionCredit = {
  async findByUser(userId: string): Promise<SubscriptionCreditRecord | null> {
    if (!userId) return null
    return toDoc<SubscriptionCreditDocument>(await subscriptionCredits().doc(userId).get())
  },
}

export default SubscriptionCredit
