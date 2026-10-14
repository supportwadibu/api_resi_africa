import { DomainError } from '#utils/domain_error'

import type { PropertyPriceTier, PropertyPricing } from '#models/property'

/**
 * Tarification d'un séjour : prix par jour, remisé selon la durée.
 *
 * Une journée court d'une heure d'arrivée à la même heure le lendemain : entrer
 * à 12h et sortir le lendemain à 12h compte pour un jour. Le décompte se fait
 * donc en jours d'occupation, et non en nuits calendaires.
 *
 * Partagé par la création et la prolongation de réservation : une prolongation
 * facturée sur une autre grille que la réservation initiale serait un bug de
 * facturation, pas une divergence acceptable.
 */

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

export interface StayPrice {
  /** Jours d'occupation facturés. */
  days: number
  /** Tarif plein d'une journée, avant remise. */
  dailyPrice: number
  /** Remise appliquée, en pourcentage. `0` si aucun palier n'est atteint. */
  discountPercent: number
  /** Montant dû après remise de durée, avant code promo. */
  subtotal: number
}

/**
 * Jours d'occupation entre deux instants, arrondis au jour entamé supérieur.
 *
 * `Math.ceil` : une sortie à 14h le lendemain d'une entrée à 12h dépasse la
 * journée due et en entame une seconde.
 */
export function countStayDays(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY)
}

/**
 * Remise applicable à une durée : le palier le plus avantageux atteint.
 *
 * Les paliers sont normalisés (triés, `min_days` uniques) à l'écriture du bien,
 * mais on ne s'y fie pas ici — un document écrit avant cette normalisation, ou
 * à la main, doit rester correctement tarifé.
 */
export function resolveDiscountPercent(days: number, tiers?: PropertyPriceTier[] | null): number {
  if (!tiers?.length) return 0

  let best = 0
  for (const tier of tiers) {
    if (days >= tier.min_days && tier.discount_percent > best) {
      best = tier.discount_percent
    }
  }

  // Une remise de 100 % rendrait le séjour gratuit : on plafonne, la validation
  // à l'entrée bornant déjà les valeurs saisies.
  return Math.min(Math.max(best, 0), 100)
}

/**
 * Calcule le montant d'un séjour et vérifie qu'il respecte les bornes du bien.
 *
 * Lève une `DomainError` 422 sur des dates inversées ou une durée hors bornes :
 * refuser tôt vaut mieux qu'enregistrer une réservation invalide.
 */
export function calculateStayPrice(
  pricing: PropertyPricing,
  startDate: Date,
  endDate: Date
): StayPrice {
  const days = countStayDays(startDate, endDate)

  if (days < 1) {
    throw new DomainError(
      'invalid_booking_dates',
      'La date de fin doit être après la date de début.',
      422
    )
  }

  const minimumStayDays = pricing.minimum_stay_days ?? 1
  const maximumStayDays = pricing.maximum_stay_days ?? null

  if (days < minimumStayDays) {
    throw new DomainError(
      'minimum_stay_not_reached',
      `Séjour minimum de ${minimumStayDays} jour(s).`,
      422
    )
  }

  if (maximumStayDays && days > maximumStayDays) {
    throw new DomainError(
      'maximum_stay_exceeded',
      `Séjour maximum de ${maximumStayDays} jour(s).`,
      422
    )
  }

  const dailyPrice = pricing.daily_price
  const discountPercent = resolveDiscountPercent(days, pricing.price_tiers)
  const fullPrice = days * dailyPrice

  // Arrondi au franc : le FCFA n'a pas de subdivision en circulation, et un
  // sous-total à virgule se propagerait jusqu'au montant encaissé.
  const subtotal = Math.round(fullPrice * (1 - discountPercent / 100))

  return { days, dailyPrice, discountPercent, subtotal }
}

/**
 * Valide la nouvelle borne de sortie d'une prolongation.
 *
 * VineJS ne voit que la forme de `end_date` : il ignore la date de début, qui
 * vit en base. Une sortie antérieure au début passait donc la validation et
 * produisait un `days_count` négatif — un séjour facturé en creux.
 *
 * Le maximum du bien est revérifié ici : la création le respecte, mais rien
 * n'empêchait d'atteindre la même durée par prolongations successives.
 */
export function assertExtensionBounds(
  pricing: PropertyPricing,
  startDate: Date,
  currentEndDate: Date,
  newEndDate: Date
): void {
  if (newEndDate.getTime() <= startDate.getTime()) {
    throw new DomainError(
      'invalid_stay_dates',
      'La date de sortie doit être postérieure à la date d’entrée.',
      422
    )
  }

  // Une prolongation ne raccourcit pas : un départ anticipé se règle par la
  // clôture et un avoir, pas en réécrivant la période facturée.
  if (newEndDate.getTime() <= currentEndDate.getTime()) {
    throw new DomainError(
      'invalid_extension',
      'La nouvelle date de sortie doit être postérieure à la date actuelle.',
      422
    )
  }

  const maximum = pricing.maximum_stay_days
  if (maximum !== null && maximum !== undefined) {
    const days = countStayDays(startDate, newEndDate)
    if (days > maximum) {
      throw new DomainError('maximum_stay_exceeded', `Séjour maximum de ${maximum} jour(s).`, 422)
    }
  }
}
