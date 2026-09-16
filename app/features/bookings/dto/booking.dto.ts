/**
 * Repris du modèle plutôt que redéclaré : une copie en dur diverge dès qu'un
 * statut est ajouté, ce qui est arrivé avec `in_progress`.
 */
import type { BookingStatus } from '#models/booking'

import type { StayType } from '../stay_type.ts'

export type { BookingStatus }

export interface BookingDto {
  id: string
  property_id: string
  /** Résidence de l'unité, figée à la création. `null` pour un bien autonome. */
  residence_id: string | null
  owner_id: string
  client_id: string
  status: BookingStatus
  start_date: Date
  end_date: Date
  /** Jours d'occupation facturés (12h → 12h le lendemain = 1 jour). */
  days_count: number
  /**
   * Tarif journalier et remise de durée figés à la réservation.
   *
   * Le propriétaire peut retoucher sa grille à tout moment : sans cette copie,
   * une réservation passée serait relue au tarif courant.
   */
  daily_price: number
  duration_discount_percent: number
  subtotal_amount: number
  discount_amount: number
  total_amount: number
  promo_code: string | null
  message: string | null
  cancelled_at: Date | null
  completed_at: Date | null
  cancellation_reason: string | null
  created_at: Date
  updated_at: Date
  /**
   * Résumé du bien réservé.
   *
   * Joint à la liste du propriétaire : sans lui, l'application n'aurait qu'un
   * identifiant à afficher, et devrait relancer une requête par réservation.
   */
  property?: BookingPropertySummary
  source?: 'online' | 'offline'
  stay_type?: StayType
  check_in_at?: Date
  check_out_at?: Date
  /** Sortie réellement constatée, distincte de la période facturée. */
  actual_check_out_at?: Date
  expected_amount?: number
  received_amount?: number
  deposit_amount?: number
  sync_status?: 'synced' | 'pending' | 'conflict'
  /** Résumé du client, joint à la liste du propriétaire. */
  client?: BookingClientSummary
}

export interface BookingClientSummary {
  id: string
  full_name: string
  phone: string
}

export interface CreateOwnerBookingInput {
  owner_id: string
  property_id: string
  client_id: string
  stay_type: StayType
  check_in_at: Date
  /** À défaut, dérivée du type de séjour. */
  check_out_at?: Date
  /** Montant convenu avec le client. À défaut, le montant attendu s'applique. */
  received_amount?: number
  deposit_amount?: number
  message?: string
  /** Immédiat : la réservation naît `in_progress`. */
  is_check_in: boolean
  client_request_id?: string | null
  /**
   * Acteur ayant réellement saisi la réservation — un gérant —, `null` ou
   * absent pour le propriétaire. Posé par le contrôleur depuis `ctx.scope`,
   * jamais par le client.
   */
  created_by?: string | null
}

export interface BookingPropertySummary {
  id: string
  title: string
  city: string
  image: string | null
}

export interface CreateBookingInput {
  property_id: string
  client_id: string
  start_date: Date
  end_date: Date
  promo_code?: string
  message?: string
}

export interface CreateCalculatedBookingInput extends CreateBookingInput {
  owner_id: string
  /** Copié depuis l'unité par le use case, jamais fourni par le client. */
  residence_id?: string | null
  days_count: number
  daily_price: number
  duration_discount_percent: number
  subtotal_amount: number
  discount_amount: number
  total_amount: number
  promo_code_id?: string | null
}

export interface UpdateBookingInput {
  end_date: Date
  promo_code?: string
  message?: string
}

export interface UpdateCalculatedBookingInput extends UpdateBookingInput {
  days_count: number
  daily_price: number
  duration_discount_percent: number
  subtotal_amount: number
  discount_amount: number
  total_amount: number
}

export interface ListBookingsInput {
  client_id?: string
  owner_id?: string
  property_id?: string
  status?: BookingStatus
  page?: number
  per_page?: number
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`, jamais par le client.
   */
  scope_property_ids?: string[] | null
}

export interface ListBookingsOutput {
  data: BookingDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface CancelBookingInput {
  reason?: string
}

/**
 * Revenu du mois en cours rapporté au précédent.
 *
 * Le montant est le revenu **constaté** au prorata des jours, comme le relevé
 * financier : un séjour à cheval sur deux mois ne doit pas imputer son total
 * aux deux, sinon le tableau de bord et le rapport se contrediraient.
 */
export interface BookingRevenueStatsDto {
  current_month: number
  previous_month: number
  /**
   * Variation en pourcentage d'un mois à l'autre, `null` quand le mois
   * précédent est à zéro : une croissance depuis rien n'a pas de valeur, et
   * afficher « +100 % » laisserait croire à un doublement.
   */
  growth_percent: number | null
}

/**
 * Chiffres du tableau de bord, tous cadrés sur le **mois en cours**.
 *
 * Le cadrage commun est la propriété qui compte : ces valeurs sont affichées
 * côte à côte, et un compteur portant sur une autre période y serait lu comme
 * s'il décrivait le mois.
 */
export interface BookingStatsDto {
  /**
   * Part des jours-bien occupés sur les jours **écoulés** du mois, de 0 à 1.
   *
   * Même convention que l'onglet Statistiques : rapporté au mois entier, le
   * taux serait structurellement bas les premiers jours du mois.
   */
  taux_occupation: number
  /** Séjours confirmés dont l'arrivée reste à venir d'ici la fin du mois. */
  upcoming: number
  /** Séjours en cours dont la période touche le mois. */
  in_progress: number
  revenue: BookingRevenueStatsDto
}
