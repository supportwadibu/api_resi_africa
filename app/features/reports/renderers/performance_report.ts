import { occupancyRatio } from '#features/reports/metrics/occupancy'
import { computeRevpar } from '#features/reports/metrics/revpar'
import type { ReportContext } from '#features/reports/dto/report.dto'
import {
  escapeHtml,
  formatAmount,
  formatDays,
  formatPercent,
  renderDocument,
} from '#features/reports/renderers/layout'

export interface PerformancePropertyRow {
  property_title: string
  occupied_days: number
  available_days: number
  gross_revenue: number
}

export interface PerformanceReportData {
  occupied_days: number
  available_days: number
  average_stay: number
  gross_revenue: number
  monthly_occupancy: Array<{ month: string; ratio: number }>
  properties: PerformancePropertyRow[]
}

function renderKeyFigures(data: PerformanceReportData): string {
  const revpar = computeRevpar(data.gross_revenue, data.available_days)
  const ratio = occupancyRatio(data.occupied_days, data.available_days)

  return `
    <section>
      <h2>Chiffres clés</h2>
      <div class="cards">
        <div class="card"><div class="card-label">Taux d'occupation</div><div class="card-value">${formatPercent(ratio)}</div></div>
        <div class="card"><div class="card-label">Jours occupés</div><div class="card-value">${data.occupied_days} / ${data.available_days}</div></div>
        <div class="card"><div class="card-label">Séjour moyen</div><div class="card-value">${formatDays(data.average_stay)}</div></div>
        <div class="card"><div class="card-label">RevPAR</div><div class="card-value">${formatAmount(revpar)}</div></div>
      </div>
    </section>`
}

const CHART_WIDTH = 400
const CHART_HEIGHT = 120
const BAR_GAP = 8

/**
 * Histogramme SVG de l'occupation mensuelle : une barre par mois, hauteur
 * proportionnelle au ratio (déjà borné 0–1 par l'appelant, donc jamais de
 * division à refaire ici).
 */
function renderOccupancyChart(
  monthlyOccupancy: PerformanceReportData['monthly_occupancy']
): string {
  const count = monthlyOccupancy.length || 1
  const barWidth = (CHART_WIDTH - BAR_GAP * (count - 1)) / count

  const bars = monthlyOccupancy
    .map((entry, index) => {
      const height = entry.ratio * CHART_HEIGHT
      const x = index * (barWidth + BAR_GAP)
      const y = CHART_HEIGHT - height

      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="var(--color-primary)" />
        <text x="${x + barWidth / 2}" y="${CHART_HEIGHT + 14}" font-size="9" text-anchor="middle" fill="var(--color-secondary)">${escapeHtml(entry.month)}</text>`
    })
    .join('')

  return `
    <section>
      <h2>Occupation mensuelle</h2>
      <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 20}" width="100%" height="160">
        ${bars}
      </svg>
    </section>`
}

function renderPropertiesTable(properties: PerformancePropertyRow[]): string {
  const sorted = [...properties].sort(
    (a, b) =>
      occupancyRatio(b.occupied_days, b.available_days) -
      occupancyRatio(a.occupied_days, a.available_days)
  )

  const rows = sorted
    .map((property) => {
      const ratio = occupancyRatio(property.occupied_days, property.available_days)
      const revpar = computeRevpar(property.gross_revenue, property.available_days)

      return `
        <tr>
          <td>${escapeHtml(property.property_title)}</td>
          <td>${formatPercent(ratio)}</td>
          <td>${property.occupied_days} / ${property.available_days}</td>
          <td>${formatAmount(property.gross_revenue)}</td>
          <td>${formatAmount(revpar)}</td>
        </tr>`
    })
    .join('')

  return `
    <section>
      <h2>Répartition par bien</h2>
      <table>
        <thead>
          <tr><th>Bien</th><th>Occupation</th><th>Jours</th><th>Revenu</th><th>RevPAR</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

/**
 * La note décrit la convention réellement appliquée en amont — celle de
 * l'écran Finance : fenêtre demandée entière, jours pondérés par type de
 * séjour. Une note qui annoncerait une autre convention que celle du calcul
 * serait pire que pas de note du tout, le lecteur ne pouvant plus rapprocher
 * le PDF d'aucun écran.
 */
function renderMethodNote(): string {
  return `
    <section>
      <h2>Note de méthode</h2>
      <p>Le taux d'occupation rapporte les jours réellement occupés à la
      capacité du parc sur la période demandée — nombre de biens exploités
      multiplié par la durée de la période. Une demi-journée compte pour une
      demi-journée d'immobilisation. Une période en cours est comptée dans son
      intégralité, y compris ses jours à venir : c'est la convention de l'écran
      Finance de l'application mobile, pour qu'une même période n'affiche
      jamais deux taux différents.</p>
      <p>Le séjour moyen est le total des jours d'occupation de la période
      divisé par le nombre de réservations, selon la même règle.</p>
    </section>`
}

export function renderPerformanceReport(
  data: PerformanceReportData,
  context: ReportContext
): string {
  const sections = [renderKeyFigures(data), renderOccupancyChart(data.monthly_occupancy)]

  // Un tableau d'une seule ligne ne ferait que répéter les chiffres clés déjà
  // affichés au-dessus.
  if (data.properties.length > 1) {
    sections.push(renderPropertiesTable(data.properties))
  }

  sections.push(renderMethodNote())

  return renderDocument({ title: 'Performance', context, sections })
}
