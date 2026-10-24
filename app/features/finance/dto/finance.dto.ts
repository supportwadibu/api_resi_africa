export interface FinanceSummaryDto {
  /** Chiffre d'affaires brut : somme encaissée sur les réservations. */
  ca_brut: number
  /**
   * Dépenses engagées sur la même période, commissions d'apporteur et
   * abonnement compris.
   */
  depenses: number
  /**
   * Bénéfice net : `ca_brut − depenses`. Peut être négatif si les charges
   * dépassent les revenus.
   */
  benefice_net: number
  /**
   * Détail : la part de `depenses` due aux apporteurs d'affaire, datée de
   * l'enregistrement des réservations. Déjà dans `depenses`, jamais retranchée
   * une seconde fois.
   */
  commissions: number
  /**
   * Sommes rendues sur départs anticipés, déjà déduites de `ca_brut`.
   * Affichées pour rapprocher la caisse, jamais retranchées une seconde fois.
   */
  remboursements: number
  /** Part des jours occupés sur la période, de 0 à 1. */
  taux_occupation: number
  reservations: number
  /** Durée moyenne d'un séjour, en jours. */
  moyen_sejour: number
  /**
   * Logements ayant porté au moins un séjour sur les jours écoulés de la
   * période — la fenêtre du taux d'occupation.
   */
  unites_louees: number
  /** Logements du parc exploité sans aucun séjour sur la même fenêtre. */
  unites_libres: number
}

export interface RevenuePointDto {
  /** Mois abrégé en français — « Jan », « Fév »… */
  month: string
  value: number
}

export interface FinanceOverviewDto {
  summary: FinanceSummaryDto
  revenue_points: RevenuePointDto[]
}

export interface FinanceFilters {
  owner_id: string
  from?: Date
  to?: Date
  /**
   * Restreint le relevé à une résidence.
   *
   * Les charges retenues sont alors ses charges communes **et** celles de ses
   * unités : les deux vivent sur des champs différents et ne se rencontrent
   * qu’ici.
   */
  residence_id?: string
  /**
   * Restreint le relevé à un logement unique.
   */
  property_id?: string
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction — le propriétaire. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
}
