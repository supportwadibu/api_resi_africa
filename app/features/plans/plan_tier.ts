/**
 * Paliers d'abonnement, du plus réduit au plus complet.
 *
 * - `free` (RESI Basic, gratuit) : réservations en ligne et au comptoir,
 *   tableau de bord, suivi des revenus, taux d'occupation, portefeuille.
 * - `pro` (RESI Pro, 3 000 F / mois) : en plus, dépenses, gestion financière,
 *   carnet clients et historique.
 * - `pro_plus` (RESI Pro+, 5 000 F / mois) : en plus, gérants et leur
 *   interface, factures, rapports PDF.
 *
 * Un palier ouvre tout ce qu'ouvrent les paliers inférieurs, et chaque route
 * déclare le palier minimal qu'elle exige plutôt qu'une liste de
 * fonctionnalités : une fonction ajoutée à un palier est ouverte d'office aux
 * paliers supérieurs.
 */
export const PLAN_TIERS = ['free', 'pro', 'pro_plus'] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

/** Paliers vendus : le palier gratuit ne s'achète pas, il reste quand rien n'est payé. */
export const PAID_PLAN_TIERS = ['pro', 'pro_plus'] as const
export type PaidPlanTier = (typeof PAID_PLAN_TIERS)[number]

const RANK: Record<PlanTier, number> = { free: 0, pro: 1, pro_plus: 2 }

/** Le palier `access` ouvre-t-il ce qu'exige `required` ? */
export function tierAllows(access: PlanTier, required: PlanTier): boolean {
  return RANK[access] >= RANK[required]
}

/** Le plus complet de deux paliers. */
export function higherTier(a: PlanTier, b: PlanTier): PlanTier {
  return RANK[a] >= RANK[b] ? a : b
}

/**
 * Palier d'un plan ou d'un abonnement enregistré.
 *
 * Deux générations d'historique à relire :
 * - `basic` (3 000 F) ouvrait l'enregistrement — réservations et clients
 *   saisis au comptoir. Son prix est celui de Pro, qui en est le
 *   prolongement : le lire `pro` ne retire rien à un abonné en cours.
 * - `full` (5 000 F), et les documents antérieurs aux paliers qui n'en
 *   portent aucun, ouvraient tout : ils valent `pro_plus`.
 */
export function readPlanTier(value: unknown): PlanTier {
  if (value === 'free') return 'free'
  if (value === 'pro' || value === 'basic') return 'pro'
  return 'pro_plus'
}

/** Palier vendu d'un plan ou d'un paiement : un plan gratuit n'a pas lieu d'être payé. */
export function readPaidPlanTier(value: unknown): PaidPlanTier {
  const tier = readPlanTier(value)
  return tier === 'free' ? 'pro' : tier
}

/** Nom commercial d'un palier, tel que le propriétaire le lit. */
export function planTierLabel(tier: PlanTier): string {
  switch (tier) {
    case 'free':
      return 'RESI Basic'
    case 'pro':
      return 'RESI Pro'
    case 'pro_plus':
      return 'RESI Pro+'
  }
}
