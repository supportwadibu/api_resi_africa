import type { FinanceOverviewDto } from '#features/finance/dto/finance.dto'
import type { ReportContext } from '#features/reports/dto/report.dto'
import {
  escapeHtml,
  formatAmount,
  formatDays,
  formatPercent,
  renderDocument,
} from '#features/reports/renderers/layout'

export interface FinancialReportData {
  overview: FinanceOverviewDto
  expenses_by_category: Array<{ category: string; amount: number }>
}

/**
 * Libellés des huit valeurs de `EXPENSE_CATEGORIES` (`app/models/expense.ts`).
 * Duplique la liste plutôt que de l'importer : coupler ce renderer au type
 * exact figerait son évolution à celle du modèle de dépense, alors qu'une
 * catégorie inconnue doit simplement retomber sur « Autre » (voir le repli
 * ci-dessous).
 */
const CATEGORY_LABELS: Record<string, string> = {
  electricity: 'Électricité',
  water: 'Eau',
  internet: 'Internet',
  tv: 'Télévision',
  cleaning: 'Ménage',
  maintenance: 'Entretien',
  taxes: 'Taxes',
  other: 'Autre',
}

/**
 * Une dépense écrite avant l'ajout d'une catégorie porte une valeur que cette
 * table ne connaît pas encore : retomber sur « Autre » évite une cellule vide
 * dans le tableau plutôt que de faire échouer le rendu.
 */
function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? 'Autre'
}

function renderKeyFigures(summary: FinancialReportData['overview']['summary']): string {
  return `
    <section>
      <h2>Chiffres clés</h2>
      <div class="cards">
        <div class="card"><div class="card-label">Chiffre d'affaires brut</div><div class="card-value">${formatAmount(summary.ca_brut)}</div></div>
        <div class="card"><div class="card-label">Dépenses</div><div class="card-value">${formatAmount(summary.depenses)}</div></div>
        <div class="card"><div class="card-label">Bénéfice net</div><div class="card-value">${formatAmount(summary.benefice_net)}</div></div>
        <div class="card"><div class="card-label">Taux d'occupation</div><div class="card-value">${formatPercent(summary.taux_occupation)}</div></div>
        <div class="card"><div class="card-label">Réservations</div><div class="card-value">${summary.reservations}</div></div>
        <div class="card"><div class="card-label">Séjour moyen</div><div class="card-value">${formatDays(summary.moyen_sejour)}</div></div>
      </div>
    </section>`
}

const CHART_WIDTH = 400
const CHART_HEIGHT = 120

/**
 * Courbe SVG des revenus mensuels. Le maximum de la série sert d'échelle
 * verticale ; à zéro il diviserait par zéro, donc la courbe reste plate
 * (tous les points au niveau du sol) plutôt que de produire des `NaN`.
 */
function renderRevenueChart(points: FinancialReportData['overview']['revenue_points']): string {
  const max = Math.max(...points.map((p) => p.value), 0)
  const step = points.length > 1 ? CHART_WIDTH / (points.length - 1) : 0

  const coordinates = points.map((point, index) => {
    const x = points.length > 1 ? index * step : CHART_WIDTH / 2
    const y = max === 0 ? CHART_HEIGHT : CHART_HEIGHT - (point.value / max) * CHART_HEIGHT
    return { x, y, point }
  })

  const polylinePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')

  const labels = coordinates
    .map(
      ({ x, point }) =>
        `<text x="${x}" y="${CHART_HEIGHT + 14}" font-size="9" text-anchor="middle" fill="var(--color-secondary)">${escapeHtml(point.month)}</text>`
    )
    .join('')

  return `
    <section>
      <h2>Évolution des revenus</h2>
      <svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 20}" width="100%" height="160">
        <polyline points="${polylinePoints}" fill="none" stroke="var(--color-primary)" stroke-width="2" />
        ${labels}
      </svg>
    </section>`
}

function renderExpensesTable(
  expenses: FinancialReportData['expenses_by_category'],
  totalDepenses: number
): string {
  const rows = expenses
    .map((expense) => {
      const share = totalDepenses > 0 ? formatPercent(expense.amount / totalDepenses) : '0 %'
      return `
        <tr>
          <td>${escapeHtml(categoryLabel(expense.category))}</td>
          <td>${formatAmount(expense.amount)}</td>
          <td>${share}</td>
        </tr>`
    })
    .join('')

  return `
    <section>
      <h2>Dépenses par catégorie</h2>
      <table>
        <thead>
          <tr><th>Catégorie</th><th>Montant</th><th>Part</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`
}

/**
 * Les charges communes d'une résidence ne sont réparties sur aucune de ses
 * unités (voir `docs/specs/residences-design.md`) : toute clé inventée
 * produirait un bénéfice par unité faux avec l'apparence de la précision. Un
 * lecteur qui l'ignore prendrait cette absence de répartition pour une
 * erreur de calcul plutôt qu'un choix délibéré.
 */
function renderMethodNote(): string {
  return `
    <section>
      <h2>Note de méthode</h2>
      <p>Le bénéfice net correspond au chiffre d'affaires brut diminué des
      dépenses de la période. Les charges communes d'une résidence (électricité,
      gardiennage…) ne sont pas réparties sur ses unités : aucune clé de
      répartition ne reflète leur usage réel, et le bénéfice par unité qui en
      résulterait serait faux avec une apparence de précision. Le détail est
      documenté dans <code>docs/specs/residences-design.md</code>.</p>
    </section>`
}

export function renderFinancialReport(data: FinancialReportData, context: ReportContext): string {
  const { summary } = data.overview
  const hasActivity = summary.ca_brut !== 0 || summary.depenses !== 0 || summary.reservations !== 0

  const sections = [renderKeyFigures(summary)]

  if (hasActivity) {
    sections.push(renderRevenueChart(data.overview.revenue_points))
    sections.push(renderExpensesTable(data.expenses_by_category, summary.depenses))
  } else {
    sections.push('<section><p>Aucun mouvement sur la période.</p></section>')
  }

  sections.push(renderMethodNote())

  return renderDocument({ title: 'Bilan financier', context, sections })
}
