export interface FinanceSummaryDto {
  /** Chiffre d'affaires brut : somme encaissée sur les réservations. */
  ca_brut: number
  /** Dépenses engagées sur la même période. */
  depenses: number
  /** Bénéfice net, qui peut être négatif si les charges dépassent les revenus. */
  benefice_net: number
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
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction — le propriétaire. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
}
