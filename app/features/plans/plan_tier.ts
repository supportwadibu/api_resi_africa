/**
 * Paliers d'abonnement.
 *
 * `basic` (3 000 F) couvre l'enregistrement : résidences, logements,
 * réservations, clients saisis pendant la réservation. `full` (5 000 F) ouvre
 * toute l'application propriétaire, y compris les fonctions à venir — d'où un
 * palier plutôt qu'une liste de fonctionnalités, qu'il faudrait compléter à
 * chaque ajout sous peine de fermer une fonction à des abonnés qui l'ont payée.
 */
export const PLAN_TIERS = ['basic', 'full'] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

/**
 * Palier d'un plan ou d'un abonnement enregistré.
 *
 * Les documents écrits avant l'introduction des paliers n'en portent pas. Ils
 * donnaient accès à tout : les lire `basic` retirerait des fonctions à des
 * abonnés en cours.
 */
export function readPlanTier(value: unknown): PlanTier {
  return value === 'basic' ? 'basic' : 'full'
}
