import { DomainError } from '#utils/domain_error'

import type { PropertyPriceTier, PropertyPricing } from '#models/property'

import { HALF_DAY_RATIO } from './stay_type.ts'

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
  /** Montant dû après remise de durée, avant code promo. Supplément de départ tardif compris. */
  subtotal: number
  /** Supplément de départ tardif, déjà compris dans `subtotal` ; 0 sans dépassement facturé. */
  lateCheckoutFee: number
}

/**
 * Jours d'occupation entre deux instants, arrondis au jour entamé supérieur.
 *
 * `Math.ceil` : une sortie à 14h le lendemain d'une entrée à 12h dépasse la
 * journée due et en entame une seconde. Sert au départ anticipé ; la
 * facturation d'un séjour passe par `resolveBilledStay`, qui tolère un léger
 * dépassement.
 */
export function countStayDays(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY)
}

/** Tolérance par défaut d'un départ tardif, en minutes. */
export const DEFAULT_LATE_CHECKOUT_GRACE_MINUTES = 60
/** Dépassement maximal facturé en demi-journée, en heures ; au-delà, un jour. */
export const DEFAULT_LATE_CHECKOUT_HALF_DAY_HOURS = 6

export interface LateCheckoutPolicy {
  graceMinutes: number
  halfDayHours: number
}

/**
 * Règle de départ tardif d'un bien.
 *
 * Les biens enregistrés avant cette règle n'en portent pas : ils prennent les
 * valeurs par défaut, si bien qu'un dépassement d'une minute ne fait plus
 * payer une journée entière sur aucun bien.
 */
export function resolveLateCheckoutPolicy(pricing: {
  late_checkout_grace_minutes?: number | null
  late_checkout_half_day_hours?: number | null
}): LateCheckoutPolicy {
  return {
    graceMinutes: pricing.late_checkout_grace_minutes ?? DEFAULT_LATE_CHECKOUT_GRACE_MINUTES,
    halfDayHours: pricing.late_checkout_half_day_hours ?? DEFAULT_LATE_CHECKOUT_HALF_DAY_HOURS,
  }
}

export interface BilledStay {
  /** Jours facturés, au minimum un. */
  days: number
  /** Le dépassement des jours entiers se facture en demi-journée. */
  lateCheckout: boolean
}

/**
 * Jours facturés d'un séjour complet, et départ tardif éventuel.
 *
 * Les jours entiers écoulés sont dus ; le reste — le dépassement — se lit sur
 * la règle du bien :
 * - jusqu'à la tolérance, il est offert ;
 * - jusqu'à `halfDayHours`, il se facture en demi-journée ;
 * - au-delà, il entame un jour de plus.
 *
 * Lundi 12h → mardi 16h : un jour, quatre heures de dépassement — un jour et
 * une demi-journée, là où le jour entamé en faisait payer deux.
 *
 * Un nombre de jours choisi au comptoir (`explicitDays`) remplace les jours
 * entiers : le dépassement se mesure alors au-delà de ces jours. Au-delà de la
 * demi-journée, le choix du propriétaire prime et aucun jour n'est ajouté —
 * il a fixé la durée en connaissance des heures.
 */
export function resolveBilledStay(
  checkIn: Date,
  checkOut: Date,
  policy: LateCheckoutPolicy,
  explicitDays?: number | null
): BilledStay {
  const elapsed = Math.max(0, checkOut.getTime() - checkIn.getTime())
  const explicit =
    typeof explicitDays === 'number' && Number.isFinite(explicitDays) && explicitDays >= 1
      ? Math.round(explicitDays)
      : null

  const base = explicit ?? Math.max(1, Math.floor(elapsed / MILLISECONDS_PER_DAY))
  const overrun = elapsed - base * MILLISECONDS_PER_DAY

  if (overrun <= policy.graceMinutes * 60 * 1000) return { days: base, lateCheckout: false }
  if (overrun <= policy.halfDayHours * 60 * 60 * 1000) return { days: base, lateCheckout: true }
  if (explicit !== null) return { days: base, lateCheckout: false }

  return { days: base + 1, lateCheckout: false }
}

/** Supplément d'un départ tardif : une demi-journée au prix unitaire en vigueur. */
export function lateCheckoutFeeFor(unitPrice: number): number {
  // Arrondi au franc : le FCFA n'a pas de subdivision en circulation.
  return Math.round(unitPrice * HALF_DAY_RATIO)
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
  if (endDate.getTime() <= startDate.getTime()) {
    throw new DomainError(
      'invalid_booking_dates',
      'La date de fin doit être après la date de début.',
      422
    )
  }

  const { days, lateCheckout } = resolveBilledStay(
    startDate,
    endDate,
    resolveLateCheckoutPolicy(pricing)
  )

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
  // Le supplément suit le tarif plein : la remise de durée récompense des
  // jours réservés, pas des heures de dépassement.
  const lateCheckoutFee = lateCheckout ? lateCheckoutFeeFor(dailyPrice) : 0
  const subtotal = Math.round(fullPrice * (1 - discountPercent / 100)) + lateCheckoutFee

  return { days, dailyPrice, discountPercent, subtotal, lateCheckoutFee }
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
    // Même décompte que la facturation : une tolérance de départ ne doit pas
    // faire refuser une prolongation que le prix compterait en jours entiers.
    const { days } = resolveBilledStay(startDate, newEndDate, resolveLateCheckoutPolicy(pricing))
    if (days > maximum) {
      throw new DomainError('maximum_stay_exceeded', `Séjour maximum de ${maximum} jour(s).`, 422)
    }
  }
}
