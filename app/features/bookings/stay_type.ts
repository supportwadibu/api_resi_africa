import type { PropertyPricing } from '#models/property'

/**
 * Types de séjour d'une réservation comptoir.
 *
 * Le séjour complet correspond au flux en ligne existant, facturé en jours
 * d'occupation. La demi-journée et le passage sont infra-journaliers : ils
 * n'existaient pas avant la réservation comptoir, où un client peut occuper
 * un bien quelques heures.
 */
export const STAY_TYPES = ['passage', 'half_day', 'full_day'] as const
export type StayType = (typeof STAY_TYPES)[number]

const MILLISECONDS_PER_HOUR = 1000 * 60 * 60

/**
 * Tarifs dérivés du tarif journalier.
 *
 * La grille du bien ne porte qu'un `daily_price` : dériver évite une migration
 * et rend les trois types de séjour disponibles sur tous les biens existants.
 * Ces ratios pourront devenir des champs surchargeables sans rien casser — le
 * calcul retomberait ici en leur absence.
 */
export const HALF_DAY_RATIO = 0.5
export const PASSAGE_RATIO = 0.3

/** Durée par défaut d'un séjour, en heures. */
const STAY_DURATION_HOURS: Record<StayType, number> = {
  full_day: 24,
  half_day: 12,
  // Un passage n'a pas de durée canonique ; 4 h sert de proposition à
  // l'ouverture du formulaire, le propriétaire saisissant l'heure réelle.
  passage: 4,
}

/**
 * Part de journée qu'un séjour immobilise, pour le taux d'occupation.
 *
 * Ne sert jamais à la facturation : compter une demi-journée pour un jour
 * entier gonflerait le taux d'occupation, mais son montant reste indivisible.
 */
const OCCUPANCY_WEIGHT: Record<StayType, number> = {
  full_day: 1,
  half_day: 0.5,
  passage: 0.25,
}

/** Tarif plein d'une unité de ce type de séjour, arrondi au franc. */
export function resolveStayTypePrice(pricing: PropertyPricing, stayType: StayType): number {
  const daily = pricing.daily_price

  switch (stayType) {
    case 'full_day':
      return Math.round(daily)
    case 'half_day':
      return Math.round(daily * HALF_DAY_RATIO)
    case 'passage':
      return Math.round(daily * PASSAGE_RATIO)
  }
}

/** Jours d'occupation immobilisés, pondérés par le type de séjour. */
export function stayTypeOccupancyDays(stayType: StayType, days: number): number {
  return OCCUPANCY_WEIGHT[stayType] * days
}

/** Heure de sortie proposée à l'ouverture du formulaire. */
export function defaultCheckOutFor(stayType: StayType, checkIn: Date): Date {
  return new Date(checkIn.getTime() + STAY_DURATION_HOURS[stayType] * MILLISECONDS_PER_HOUR)
}
