import { DomainError } from '#utils/domain_error'

import type { PropertyPriceTier, PropertyPricing } from '#models/property'

import { HALF_DAY_RATIO } from './stay_type.ts'

/**
 * Tarification d'un séjour : prix par nuit, remisé selon la durée.
 *
 * Un séjour se compte en nuits, et chaque nuit se termine à l'heure de départ
 * du bien (12h30 par défaut) le lendemain, quelle que soit l'heure d'arrivée :
 * arriver à 10h ou à 22h et partir le lendemain à 12h30 fait une nuit. Le
 * décompte en blocs de 24h depuis l'arrivée faisait varier l'heure de sortie
 * — et le prix — avec l'heure d'entrée.
 *
 * Les champs restent nommés en jours (`days_count`, `daily_price`) : le mobile
 * et le backoffice les lisent sous ce nom, et l'historique les porte.
 *
 * Partagé par la création et la prolongation de réservation : une prolongation
 * facturée sur une autre grille que la réservation initiale serait un bug de
 * facturation, pas une divergence acceptable.
 */

const MILLISECONDS_PER_MINUTE = 1000 * 60
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_MINUTE * 60 * 24

export interface StayPrice {
  /** Nuits facturées. */
  days: number
  /** Tarif plein d'une nuit, avant remise. */
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
 * Ne sert plus qu'au repli du départ anticipé sur l'historique sans
 * `days_count` ; la facturation passe par `resolveBilledStay`.
 */
export function countStayDays(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / MILLISECONDS_PER_DAY)
}

/** Heure de départ par défaut, « HH:mm » à l'heure d'Abidjan. */
export const DEFAULT_CHECKOUT_TIME = '12:30'
/** Tolérance par défaut d'un départ tardif, en minutes. */
export const DEFAULT_LATE_CHECKOUT_GRACE_MINUTES = 60
/** Dépassement maximal facturé en demi-nuit, en heures ; au-delà, une nuit. */
export const DEFAULT_LATE_CHECKOUT_HALF_DAY_HOURS = 6

/** « HH:mm » sur 24 h, de 00:00 à 23:59. */
export const CHECKOUT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface LateCheckoutPolicy {
  /** Heure de départ, en minutes depuis minuit (12h30 → 750). */
  checkoutMinutes: number
  graceMinutes: number
  halfDayHours: number
}

/**
 * Heure de départ « HH:mm » en minutes depuis minuit.
 *
 * Une valeur absente ou mal formée retombe sur l'heure par défaut : la
 * validation l'écarte à l'écriture, mais un document écrit à la main ne doit
 * pas rendre un séjour infacturable.
 */
export function parseCheckoutTime(value?: string | null): number {
  const time = value && CHECKOUT_TIME_PATTERN.test(value) ? value : DEFAULT_CHECKOUT_TIME
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Règle de départ d'un bien : heure de départ, puis départ tardif.
 *
 * Les biens enregistrés avant ces champs n'en portent pas : ils prennent les
 * valeurs par défaut — 12h30, une heure de tolérance —, si bien qu'aucun bien
 * existant ne reste sur l'ancien décompte en blocs de 24h.
 */
export function resolveLateCheckoutPolicy(pricing: {
  checkout_time?: string | null
  late_checkout_grace_minutes?: number | null
  late_checkout_half_day_hours?: number | null
}): LateCheckoutPolicy {
  return {
    checkoutMinutes: parseCheckoutTime(pricing.checkout_time),
    graceMinutes: pricing.late_checkout_grace_minutes ?? DEFAULT_LATE_CHECKOUT_GRACE_MINUTES,
    halfDayHours: pricing.late_checkout_half_day_hours ?? DEFAULT_LATE_CHECKOUT_HALF_DAY_HOURS,
  }
}

/**
 * Fin de la `nights`-ième nuit d'un séjour : le jour d'arrivée plus `nights`
 * jours, à l'heure de départ.
 *
 * Calculé sur le calendrier UTC : Abidjan est à UTC+0 sans heure d'été, si
 * bien que la date UTC est la date locale du bien. Un pays à décalage
 * demanderait de porter le fuseau sur le bien.
 */
export function checkoutDeadline(checkIn: Date, nights: number, checkoutMinutes: number): Date {
  return new Date(
    Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate() + nights) +
      checkoutMinutes * MILLISECONDS_PER_MINUTE
  )
}

/** Sortie prévue d'un séjour de `nights` nuits, selon la règle du bien. */
export function plannedCheckOutFor(
  checkIn: Date,
  nights: number,
  pricing: { checkout_time?: string | null }
): Date {
  return checkoutDeadline(checkIn, Math.max(1, nights), parseCheckoutTime(pricing.checkout_time))
}

/**
 * Sortie d'une prolongation : l'heure de départ du bien, le jour demandé.
 *
 * Prolonger, c'est ajouter des nuits. Le mobile ajoute des jours à la sortie
 * en cours ; sur une réservation antérieure aux nuits à heure fixe, celle-ci
 * garde l'heure d'entrée — 15h —, et la prolongation serait facturée en
 * départ tardif après 12h30.
 */
export function extensionCheckOutFor(
  checkIn: Date,
  requested: Date,
  pricing: { checkout_time?: string | null }
): Date {
  const nights = Math.round(
    (Date.UTC(requested.getUTCFullYear(), requested.getUTCMonth(), requested.getUTCDate()) -
      Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())) /
      MILLISECONDS_PER_DAY
  )
  return plannedCheckOutFor(checkIn, nights, pricing)
}

export interface BilledStay {
  /** Nuits facturées, au minimum une. */
  days: number
  /** Le dépassement de l'heure de départ se facture en demi-nuit. */
  lateCheckout: boolean
}

/**
 * Nuits facturées d'un séjour complet, et départ tardif éventuel.
 *
 * Les nuits dont l'heure de départ est passée sont dues, au minimum une ; le
 * reste — le dépassement après la dernière heure de départ — se lit sur la
 * règle du bien :
 * - jusqu'à la tolérance, il est offert ;
 * - jusqu'à `halfDayHours`, il se facture en demi-nuit ;
 * - au-delà, il entame une nuit de plus.
 *
 * Lundi 22h → mardi 12h30 : une nuit. Lundi 10h → mardi 16h : une nuit, trois
 * heures et demie de dépassement — une nuit et une demi-nuit.
 *
 * Un nombre de nuits choisi au comptoir (`explicitDays`) remplace les nuits
 * écoulées : le dépassement se mesure alors après l'heure de départ de la
 * dernière nuit choisie. Au-delà de la demi-nuit, le choix du propriétaire
 * prime et aucune nuit n'est ajoutée — il a fixé la durée en connaissance des
 * heures.
 */
export function resolveBilledStay(
  checkIn: Date,
  checkOut: Date,
  policy: LateCheckoutPolicy,
  explicitDays?: number | null
): BilledStay {
  const explicit =
    typeof explicitDays === 'number' && Number.isFinite(explicitDays) && explicitDays >= 1
      ? Math.round(explicitDays)
      : null

  const base = explicit ?? Math.max(1, elapsedNights(checkIn, checkOut, policy.checkoutMinutes))
  const overrun =
    checkOut.getTime() - checkoutDeadline(checkIn, base, policy.checkoutMinutes).getTime()

  if (overrun <= policy.graceMinutes * MILLISECONDS_PER_MINUTE) {
    return { days: base, lateCheckout: false }
  }
  if (overrun <= policy.halfDayHours * 60 * MILLISECONDS_PER_MINUTE) {
    return { days: base, lateCheckout: true }
  }
  if (explicit !== null) return { days: base, lateCheckout: false }

  return { days: base + 1, lateCheckout: false }
}

/** Nuits dont l'heure de départ est atteinte à `checkOut`, éventuellement zéro. */
function elapsedNights(checkIn: Date, checkOut: Date, checkoutMinutes: number): number {
  const calendarDays = Math.round(
    (Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate()) -
      Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())) /
      MILLISECONDS_PER_DAY
  )
  const minuteOfDay = checkOut.getUTCHours() * 60 + checkOut.getUTCMinutes()
  return minuteOfDay >= checkoutMinutes ? calendarDays : calendarDays - 1
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
      `Séjour minimum de ${minimumStayDays} nuit(s).`,
      422
    )
  }

  if (maximumStayDays && days > maximumStayDays) {
    throw new DomainError(
      'maximum_stay_exceeded',
      `Séjour maximum de ${maximumStayDays} nuit(s).`,
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
 * Grille d'un séjour au prix négocié : le palier remplace le prix par jour,
 * sans remise de durée — le prix négocié est final (voir
 * `negotiation_rules.ts`). Bornes de durée et départ tardif restent ceux du
 * bien.
 */
export function negotiatedPricing(pricing: PropertyPricing, dailyPrice: number): PropertyPricing {
  return { ...pricing, daily_price: dailyPrice, price_tiers: [] }
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
      throw new DomainError('maximum_stay_exceeded', `Séjour maximum de ${maximum} nuit(s).`, 422)
    }
  }
}
