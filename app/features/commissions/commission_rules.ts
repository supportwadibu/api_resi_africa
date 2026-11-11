import { DomainError } from '#utils/domain_error'

import { calculateStayPrice, type StayPrice } from '#features/bookings/stay_pricing'
import type { PropertyPricing } from '#models/property'

/**
 * Commission de RESI sur les réservations en ligne, sans Firestore : testée
 * seule.
 *
 * RESI majore le prix du propriétaire dans l'application client et garde la
 * différence. La majoration porte sur le **prix par nuit** : le client voit un
 * prix par nuit majoré, et c'est sur lui que s'appliquent la remise de durée
 * et le supplément de départ tardif. La commission d'un séjour est donc
 * l'écart entre deux calculs du même séjour, l'un sur la grille du client,
 * l'autre sur celle du propriétaire — le montant estimé par l'application à
 * partir de la grille publique tombe ainsi juste au franc près.
 *
 * Elle s'applique aussi aux paliers de négociation : un palier est un prix
 * par nuit du propriétaire, majoré comme le prix normal.
 *
 * Le comptoir n'en porte jamais : RESI n'intervient pas dans la vente.
 */

export const COMMISSION_MODES = ['percent', 'fixed'] as const
export type CommissionMode = (typeof COMMISSION_MODES)[number]

export interface CommissionSettings {
  /** Coupée : les prix publics sont ceux du propriétaire, comme avant la commission. */
  enabled: boolean
  /** `percent` : `value` % du prix par nuit. `fixed` : `value` francs par nuit. */
  mode: CommissionMode
  value: number
}

/** Règle figée sur une réservation : changer le réglage ne réécrit pas l'historique. */
export interface CommissionRule {
  mode: CommissionMode
  value: number
}

/**
 * Réglages tant que le backoffice n'en a enregistré aucun : commission coupée,
 * pour qu'un déploiement ne change aucun prix avant la décision de l'équipe.
 */
export const DEFAULT_COMMISSION_SETTINGS: CommissionSettings = {
  enabled: false,
  mode: 'percent',
  value: 0,
}

/** Pourcentage maximal : au-delà, le client paierait plus du double du prix du propriétaire. */
export const MAX_COMMISSION_PERCENT = 100

export function resolveCommissionSettings(
  stored: Partial<CommissionSettings> | null | undefined
): CommissionSettings {
  const mode = stored?.mode && COMMISSION_MODES.includes(stored.mode) ? stored.mode : 'percent'
  const value =
    typeof stored?.value === 'number' && Number.isFinite(stored.value) && stored.value > 0
      ? stored.value
      : 0
  return { enabled: stored?.enabled === true, mode, value }
}

export function assertValidCommissionSettings(input: CommissionSettings): void {
  if (input.mode === 'percent' && input.value > MAX_COMMISSION_PERCENT) {
    throw new DomainError(
      'invalid_commission_settings',
      `Une commission en pourcentage ne peut pas dépasser ${MAX_COMMISSION_PERCENT} %.`,
      422
    )
  }
  if (input.enabled && !(input.value > 0)) {
    throw new DomainError(
      'invalid_commission_settings',
      'Indiquez une commission positive pour l’activer.',
      422
    )
  }
}

/** Règle à appliquer aux nouvelles réservations, `null` si la commission est coupée. */
export function activeCommissionRule(settings: CommissionSettings): CommissionRule | null {
  return settings.enabled && settings.value > 0
    ? { mode: settings.mode, value: settings.value }
    : null
}

/**
 * Prix par nuit affiché au client.
 *
 * Arrondi au franc : le FCFA n'a pas de subdivision en circulation.
 */
export function markupDailyPrice(price: number, rule: CommissionRule | null): number {
  if (!rule || !(price > 0)) return price
  return rule.mode === 'fixed'
    ? price + Math.round(rule.value)
    : Math.round(price * (1 + rule.value / 100))
}

/**
 * Prix du propriétaire correspondant à un prix vu par le client, pour filtrer
 * la base sur une borne saisie par le client. Approché au franc : une borne
 * de recherche n'a pas besoin d'être exacte.
 */
export function ownerDailyPriceFor(clientPrice: number, rule: CommissionRule | null): number {
  if (!rule) return clientPrice
  const price =
    rule.mode === 'fixed'
      ? clientPrice - Math.round(rule.value)
      : clientPrice / (1 + rule.value / 100)
  return Math.max(0, Math.round(price))
}

/** Grille vue par le client : seul le prix par nuit change. */
export function markupPricing<T extends { daily_price: number }>(
  pricing: T,
  rule: CommissionRule | null
): T {
  if (!rule) return pricing
  return { ...pricing, daily_price: markupDailyPrice(pricing.daily_price, rule) }
}

export interface OnlineStayPrice {
  /** Ce que touche le propriétaire. */
  owner: StayPrice
  /** Ce que voit le client, avant code promo. */
  client: StayPrice
  rule: CommissionRule | null
}

/**
 * Prix d'un séjour en ligne, des deux côtés.
 *
 * `pricing` est la grille du propriétaire — déjà ramenée au palier négocié le
 * cas échéant.
 */
export function priceOnlineStay(
  pricing: PropertyPricing,
  startDate: Date,
  endDate: Date,
  rule: CommissionRule | null
): OnlineStayPrice {
  const owner = calculateStayPrice(pricing, startDate, endDate)
  const client = rule ? calculateStayPrice(markupPricing(pricing, rule), startDate, endDate) : owner
  return { owner, client, rule }
}

/** Champs figés d'une réservation en ligne, à partir de son prix et du code promo. */
export interface OnlineBookingAmounts {
  days_count: number
  daily_price: number
  duration_discount_percent: number
  subtotal_amount: number
  late_checkout_fee: number
  discount_amount: number
  total_amount: number
  commission_mode?: CommissionMode
  commission_value?: number
  commission_amount?: number
  client_daily_price?: number
  client_subtotal_amount?: number
  client_total_amount?: number
}

/**
 * Montants à figer sur une réservation en ligne.
 *
 * Avec commission, `total_amount` reste ce que touche le propriétaire : son
 * tableau de bord, ses rapports et son portefeuille ne lisent que lui. Le code
 * promo est un geste de RESI : il réduit ce que paie le client, pas ce que
 * touche le propriétaire.
 *
 * Sans commission, les montants sont ceux d'avant la commission — code promo
 * compris dans `total_amount` — pour qu'un déploiement ne change rien tant que
 * l'équipe ne l'a pas activée.
 */
export function onlineBookingAmounts(
  price: OnlineStayPrice,
  promoDiscount: number
): OnlineBookingAmounts {
  const { owner, client, rule } = price
  const discount = Math.max(0, Math.min(promoDiscount, client.subtotal))
  const base = {
    days_count: owner.days,
    daily_price: owner.dailyPrice,
    duration_discount_percent: owner.discountPercent,
    subtotal_amount: owner.subtotal,
    late_checkout_fee: owner.lateCheckoutFee,
    discount_amount: discount,
  }

  if (!rule) return { ...base, total_amount: owner.subtotal - discount }

  return {
    ...base,
    total_amount: owner.subtotal,
    commission_mode: rule.mode,
    commission_value: rule.value,
    commission_amount: client.subtotal - owner.subtotal,
    client_daily_price: client.dailyPrice,
    client_subtotal_amount: client.subtotal,
    client_total_amount: client.subtotal - discount,
  }
}
