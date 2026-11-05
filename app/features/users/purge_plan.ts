import { COLLECTIONS, type CollectionName } from '#firebase/firestore'

/**
 * Ce qu'efface la suppression définitive d'un compte.
 *
 * Firestore n'a ni clé étrangère ni suppression en cascade : chaque ensemble
 * rattaché au compte est listé ici, avec le champ qui l'y rattache. L'aperçu
 * et la suppression lisent la même liste — ce que l'administrateur voit
 * compté est exactement ce qui sera effacé.
 *
 * La liste ne dépend pas du rôle : un client n'a pas de logement, et l'étape
 * compte zéro. Un plan par rôle oublierait les données d'un compte dont le
 * rôle a été changé à la main.
 *
 * Restent hors de cette liste, à dessein :
 *
 * - les réservations prises par le compte en tant que **client** chez un
 *   propriétaire, et leurs paiements : elles appartiennent à la comptabilité
 *   de ce propriétaire (revenu constaté, portefeuille crédité). Elles sont
 *   conservées avec le nom figé dans `client_snapshot` ;
 * - le parrainage où le compte est **filleul**, dès qu'il a rapporté : le gain
 *   est inscrit au journal du parrain. Un parrainage resté sans gain est
 *   effacé (voir `UserPurgeRepository`) ;
 * - le journal d'audit : trace de sécurité, acteur figé, purgé par sa propre
 *   rétention. La suppression définitive y est elle-même tracée ;
 * - les campagnes de notification qui ont ciblé le compte : historique des
 *   envois de l'équipe.
 */

/** Documents dont un champ porte l'identifiant du compte. */
export interface PurgeQueryStep {
  kind: 'query'
  key: string
  label: string
  collection: CollectionName
  field: string
}

/** Document unique dont l'identifiant *est* celui du compte. */
export interface PurgeDocStep {
  kind: 'doc'
  key: string
  label: string
  collection: CollectionName
}

export type PurgeStep = PurgeQueryStep | PurgeDocStep

function byField(
  key: string,
  label: string,
  collection: CollectionName,
  field: string
): PurgeQueryStep {
  return { kind: 'query', key, label, collection, field }
}

function byId(key: string, label: string, collection: CollectionName): PurgeDocStep {
  return { kind: 'doc', key, label, collection }
}

export const PURGE_STEPS: readonly PurgeStep[] = [
  // Compte
  byField('sessions', 'Sessions', COLLECTIONS.authSessions, 'user_id'),
  byField('device_tokens', 'Appareils notifiés', COLLECTIONS.deviceTokens, 'user_id'),
  byField('feedbacks', 'Retours envoyés', COLLECTIONS.feedbacks, 'user_id'),
  byField(
    'promo_code_usages',
    'Utilisations de codes promo',
    COLLECTIONS.promoCodeUsages,
    'user_id'
  ),
  byField(
    'negotiations_as_client',
    'Négociations demandées',
    COLLECTIONS.negotiations,
    'client_id'
  ),
  byField(
    'manager_assignment',
    'Affectation de gérant',
    COLLECTIONS.managerAssignments,
    'manager_id'
  ),

  // Propriétaire
  byField('properties', 'Logements', COLLECTIONS.properties, 'owner_id'),
  byField('residences', 'Résidences', COLLECTIONS.residences, 'owner_id'),
  byField('bookings', 'Réservations reçues', COLLECTIONS.bookings, 'owner_id'),
  byField('booking_payments', 'Paiements de réservation', COLLECTIONS.bookingPayments, 'owner_id'),
  byField('clients', 'Fiches du carnet clients', COLLECTIONS.clients, 'owner_id'),
  byField('expenses', 'Dépenses', COLLECTIONS.expenses, 'owner_id'),
  byField('negotiations_as_owner', 'Négociations reçues', COLLECTIONS.negotiations, 'owner_id'),
  byField('managers', 'Affectations de ses gérants', COLLECTIONS.managerAssignments, 'owner_id'),
  byField('wallets', 'Portefeuilles', COLLECTIONS.wallets, 'owner_id'),
  byField(
    'wallet_transactions',
    'Mouvements de portefeuille',
    COLLECTIONS.walletTransactions,
    'owner_id'
  ),
  byField('withdrawals', 'Demandes de retrait', COLLECTIONS.withdrawalRequests, 'owner_id'),
  byId('payout_numbers', 'Numéros de versement', COLLECTIONS.payoutNumbers),
  byField('reports', 'Rapports édités', COLLECTIONS.reportGenerations, 'owner_id'),
  byField('subscriptions', 'Abonnements', COLLECTIONS.subscriptions, 'user_id'),
  byField(
    'subscription_events',
    "Historique d'abonnement",
    COLLECTIONS.subscriptionEvents,
    'user_id'
  ),
  byField(
    'subscription_payments',
    "Paiements d'abonnement",
    COLLECTIONS.paymentHistories,
    'user_id'
  ),
  byId('subscription_credit', "Crédit d'abonnement", COLLECTIONS.subscriptionCredits),

  // Parrainage, en tant que parrain
  byField('sponsored', 'Filleuls parrainés', COLLECTIONS.sponsorships, 'sponsor_id'),
  byField(
    'sponsorship_transactions',
    'Mouvements de parrainage',
    COLLECTIONS.sponsorshipTransactions,
    'user_id'
  ),
  byField(
    'sponsorship_redemptions',
    'Retraits de parrainage',
    COLLECTIONS.sponsorshipRedemptions,
    'user_id'
  ),
  byId('sponsorship_account', 'Compte de parrainage', COLLECTIONS.sponsorshipAccounts),
]

/**
 * Prefixes des fichiers du compte chez l'hébergeur, relatifs aux dossiers
 * configurés : photos d'annonce rangées par propriétaire, pièces d'identité
 * du dossier propriétaire et de son carnet clients.
 */
export function purgeFilePrefixes(userId: string): { images: string[]; documents: string[] } {
  return {
    images: [`${userId}/`],
    documents: [`owners/${userId}/`, `clients/${userId}/`],
  }
}

/**
 * Un parrainage où le compte est filleul peut-il disparaître avec lui ?
 *
 * Seulement s'il n'a encore rien rapporté : au-delà, le gain figure au journal
 * du parrain, et effacer sa source laisserait une ligne sans origine.
 */
export function isSponsorshipErasable(status: string | null | undefined): boolean {
  return status === 'registered'
}
