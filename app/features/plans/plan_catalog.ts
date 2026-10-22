import { readPlanTier, type PaidPlanTier } from './plan_tier.ts'

/**
 * Catalogue des offres RESI, tel que présenté aux propriétaires.
 *
 * Les plans vivent en base, modifiables depuis le backoffice ; ce catalogue en
 * est la référence, appliquée par `node ace plans:sync`. RESI Basic n'y figure
 * pas : gratuit, il n'a pas de plan, il reste quand rien n'est payé — son
 * descriptif est dans l'application.
 *
 * Les fonctions listées sont celles qu'ouvrent les groupes de routes de
 * `start/routes.ts` : un palier changé ici sans y toucher promettrait ce que
 * l'API refuse.
 */
export interface PlanCatalogEntry {
  tier: PaidPlanTier
  name: string
  description: string
  price: number
  duration_days: number
  features: string[]
}

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    tier: 'pro',
    name: 'RESI Pro',
    description: 'Gardez le contrôle de votre activité et de vos finances.',
    price: 3000,
    duration_days: 30,
    features: [
      'Toutes les fonctionnalités de RESI Basic',
      'Gestion et suivi des dépenses',
      'Gestion financière : revenus, charges et rentabilité',
      'Gestion de la clientèle et historique des réservations',
      'Suivi des performances financières de chaque résidence',
    ],
  },
  {
    tier: 'pro_plus',
    name: 'RESI Pro+',
    description: "Une solution complète pour les professionnels de l'hébergement.",
    price: 5000,
    duration_days: 30,
    features: [
      'Toutes les fonctionnalités de RESI Pro',
      'Gestion des gérants et des collaborateurs',
      'Interface dédiée pour chaque gérant ou agent',
      'Génération et envoi de factures aux clients',
      'Rapports PDF financiers et suivi des dépenses',
      'Rapports PDF des réservations et du taux d’occupation',
      'Fiches de police et rapports voyageurs en PDF',
    ],
  },
]

/**
 * Plan existant à aligner sur le catalogue pour `tier`, ou `null` s'il faut le
 * créer.
 *
 * Le plan actif d'abord : c'est celui qu'on vend. À défaut, un plan retiré du
 * même palier est repris plutôt que doublé. Le palier est lu comme à la
 * souscription : un plan antérieur aux paliers vaut Pro+.
 */
export function planToSync<T extends { tier?: unknown; is_active: boolean }>(
  plans: readonly T[],
  tier: PaidPlanTier
): T | null {
  const ofTier = plans.filter((plan) => readPlanTier(plan.tier) === tier)
  return ofTier.find((plan) => plan.is_active) ?? ofTier[0] ?? null
}
