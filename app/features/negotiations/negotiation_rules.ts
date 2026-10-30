import { DomainError } from '#utils/domain_error'

/**
 * Négociation, sans Firestore : testée seule.
 *
 * Pas de discussion : le propriétaire pose à l'avance des **paliers** de prix
 * par jour, du plus haut au plus bas. Le client qui appuie sur « Négocier »
 * voit le premier ; chaque « Négocier encore » révèle le suivant. Le dernier
 * est le prix plancher : au-delà, la négociation s'arrête, et le client
 * choisit un palier déjà vu ou le prix normal.
 *
 * Les paliers ne sortent jamais tous à la fois : la route publique ne les
 * porte pas, et le serveur ne révèle que le suivant. Sans quoi le client irait
 * droit au plancher.
 *
 * Le prix négocié est **final** : la remise de durée ne s'y ajoute pas — le
 * dernier palier est déjà le plus bas que le propriétaire accepte.
 */

/** Paliers au plus : au-delà, « Négocier encore » devient un jeu de patience. */
export const MAX_NEGOTIATION_STEPS = 5

/**
 * Jours pendant lesquels une négociation reste acquise. Rouvrir la fiche ne
 * repart pas du premier palier — sinon recommencer suffirait à tout revoir —,
 * mais un client qui revient le mois suivant renégocie à neuf.
 */
export const NEGOTIATION_VALIDITY_DAYS = 7

export interface NegotiationSettings {
  enabled: boolean
  /** Prix par jour de chaque palier, strictement décroissants. */
  prices: number[]
}

/**
 * Vérifie et range la configuration saisie par le propriétaire.
 *
 * Chaque palier est sous le prix normal et sous le précédent : un palier
 * plus cher que le précédent ferait « négocier » à la hausse.
 */
export function normalizeNegotiation(
  input: { enabled: boolean; prices?: number[] | null },
  dailyPrice: number
): NegotiationSettings {
  const prices = (input.prices ?? []).map((p) => Math.round(p))

  if (prices.length > MAX_NEGOTIATION_STEPS) {
    throw new DomainError(
      'invalid_negotiation',
      `La négociation compte au plus ${MAX_NEGOTIATION_STEPS} paliers.`,
      422
    )
  }

  let previous = dailyPrice
  for (const price of prices) {
    if (!(price > 0) || price >= previous) {
      throw new DomainError(
        'invalid_negotiation',
        'Chaque palier doit être positif et inférieur au prix normal et au palier précédent.',
        422
      )
    }
    previous = price
  }

  if (input.enabled && prices.length === 0) {
    throw new DomainError(
      'invalid_negotiation',
      'Ajoutez au moins un palier pour activer la négociation.',
      422
    )
  }

  return { enabled: input.enabled, prices }
}

/**
 * Paliers proposables aujourd'hui. Un prix normal baissé après coup peut
 * passer sous un palier : celui-ci n'est plus une remise et disparaît.
 */
export function availableSteps(
  negotiation: NegotiationSettings | null | undefined,
  dailyPrice: number
): number[] {
  if (!negotiation?.enabled) return []
  return negotiation.prices.filter((price) => price > 0 && price < dailyPrice)
}

export type NextStepResult =
  | { status: 'not_negotiable' }
  | { status: 'offer'; offers: number[] }
  | { status: 'exhausted'; offers: number[] }

/**
 * Palier suivant, à partir de ceux déjà révélés au client.
 *
 * Les paliers révélés sont figés : un propriétaire qui retouche sa grille ne
 * reprend pas une offre déjà faite. Celui qui coupe la négociation, si : le
 * bien n'est plus négociable, et une offre restée affichée ne se réserverait
 * plus.
 */
export function nextStep(revealed: number[], steps: number[]): NextStepResult {
  if (steps.length === 0) return { status: 'not_negotiable' }
  if (revealed.length >= steps.length) return { status: 'exhausted', offers: revealed }
  return { status: 'offer', offers: [...revealed, steps[revealed.length]] }
}

const DAY_MS = 24 * 60 * 60 * 1000

export function negotiationExpiry(now: Date): Date {
  return new Date(now.getTime() + NEGOTIATION_VALIDITY_DAYS * DAY_MS)
}

export function negotiationId(propertyId: string, clientId: string): string {
  return `${propertyId}_${clientId}`
}
