import type { ReportPeriodPreset, ResolvedPeriod } from '#features/reports/report_period'

/**
 * Les trois rapports adossés à des données existantes.
 *
 * `maintenance` et `fiscal` figuraient dans la maquette mobile : le premier
 * suppose une notion d'intervention et de prestataire, le second un marqueur
 * de déductibilité sur les dépenses. Ni l'une ni l'autre n'existe, et les
 * produire donnerait un document qui promet plus qu'il ne montre.
 */
export type ReportType = 'financial' | 'performance' | 'reservations'

export interface GenerateReportInput {
  type: ReportType
  period: ReportPeriodPreset
  from?: string
  to?: string
  /** Absent : toutes les résidences du propriétaire. */
  residence_id?: string
}

/**
 * Tout ce que les renderers ont besoin de savoir sur l'en-tête du document,
 * indépendamment du type de rapport.
 */
export interface ReportContext {
  owner_name: string
  /** Nom de la résidence, ou `null` pour l'ensemble du parc. */
  residence_name: string | null
  period: ResolvedPeriod
  /** Instant d'édition, imprimé en page de garde. */
  generated_at: Date
}

export interface GeneratedReportDto {
  pdf: Buffer
  filename: string
  period: {
    from: string
    to: string
  }
}
