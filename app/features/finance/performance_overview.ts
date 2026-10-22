import type { FinanceOverviewDto, RevenuePointDto } from './dto/finance.dto.ts'

/**
 * Relevé de RESI Basic : le suivi des revenus et du taux d'occupation, sans
 * charges ni rentabilité.
 *
 * Le tableau de bord des performances est gratuit ; la gestion financière —
 * dépenses, commissions, bénéfice net — relève de RESI Pro. Champs choisis un à
 * un plutôt que retirés : un champ ajouté au relevé complet n'apparaît pas ici
 * sans décision.
 */
export interface PerformanceOverviewDto {
  summary: {
    ca_brut: number
    taux_occupation: number
    reservations: number
    moyen_sejour: number
  }
  revenue_points: RevenuePointDto[]
}

export function toPerformanceOverview(overview: FinanceOverviewDto): PerformanceOverviewDto {
  const summary = overview.summary
  return {
    summary: {
      ca_brut: summary.ca_brut,
      taux_occupation: summary.taux_occupation,
      reservations: summary.reservations,
      moyen_sejour: summary.moyen_sejour,
    },
    revenue_points: overview.revenue_points,
  }
}
