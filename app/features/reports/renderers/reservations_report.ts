import type { ReportContext } from '#features/reports/dto/report.dto'
import { escapeHtml, formatAmount, renderDocument } from '#features/reports/renderers/layout'

export interface ReservationRow {
  booking_id: string
  check_in_at: Date
  check_out_at: Date
  property_title: string
  client_name: string
  client_phone: string
  has_id_document: boolean
  days_count: number
  total_amount: number
  settled_amount: number
  source: 'online' | 'offline'
}

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Africa/Abidjan',
})

const SOURCE_LABELS: Record<ReservationRow['source'], string> = {
  online: 'En ligne',
  offline: 'Comptoir',
}

/**
 * « Fournie » / « Non fournie », jamais « Vérifiée » : aucune vérification
 * d’identité n’existe dans le modèle, `has_id_document` atteste seulement
 * qu’une pièce a été déposée. Sur un document qui peut servir de preuve, dire
 * « Vérifiée » prêterait au propriétaire un contrôle qu’il n’a pas fait.
 */
function idDocumentLabel(hasIdDocument: boolean): string {
  return hasIdDocument ? 'Fournie' : 'Non fournie'
}

function renderKeyFigures(rows: readonly ReservationRow[]): string {
  const settledTotal = rows.reduce((total, row) => total + row.settled_amount, 0)
  const outstandingTotal = rows.reduce(
    (total, row) => total + Math.max(0, row.total_amount - row.settled_amount),
    0
  )
  const onlineCount = rows.filter((row) => row.source === 'online').length
  const offlineCount = rows.filter((row) => row.source === 'offline').length

  return `
    <section>
      <h2>Chiffres clés</h2>
      <div class="cards">
        <div class="card"><div class="card-label">Séjours</div><div class="card-value">${rows.length}</div></div>
        <div class="card"><div class="card-label">Total encaissé</div><div class="card-value">${formatAmount(settledTotal)}</div></div>
        <div class="card"><div class="card-label">Reste à percevoir</div><div class="card-value">${formatAmount(outstandingTotal)}</div></div>
        <div class="card"><div class="card-label">En ligne / comptoir</div><div class="card-value">${onlineCount} / ${offlineCount}</div></div>
      </div>
    </section>`
}

function renderReservationsTable(rows: readonly ReservationRow[]): string {
  const tableRows = rows
    .map((row) => {
      return `
        <tr>
          <td>${DATE_FORMATTER.format(row.check_in_at)}</td>
          <td>${DATE_FORMATTER.format(row.check_out_at)}</td>
          <td>${escapeHtml(row.property_title)}</td>
          <td>${escapeHtml(row.client_name)}</td>
          <td>${escapeHtml(row.client_phone)}</td>
          <td>${idDocumentLabel(row.has_id_document)}</td>
          <td>${row.days_count}</td>
          <td>${formatAmount(row.total_amount)}</td>
          <td>${formatAmount(row.settled_amount)}</td>
          <td>${SOURCE_LABELS[row.source]}</td>
        </tr>`
    })
    .join('')

  return `
    <section>
      <h2>Séjours</h2>
      <table>
        <thead>
          <tr>
            <th>Arrivée</th><th>Départ</th><th>Bien</th><th>Client</th><th>Téléphone</th>
            <th>Pièce</th><th>Jours</th><th>Total</th><th>Encaissé</th><th>Canal</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>`
}

function renderPendingPayments(rows: readonly ReservationRow[]): string {
  const pending = rows.filter((row) => row.settled_amount < row.total_amount)

  if (pending.length === 0) return ''

  const items = pending
    .map((row) => {
      const outstanding = row.total_amount - row.settled_amount
      return `
        <tr>
          <td>${escapeHtml(row.client_name)}</td>
          <td>${escapeHtml(row.property_title)}</td>
          <td>${formatAmount(outstanding)}</td>
        </tr>`
    })
    .join('')

  return `
    <section>
      <h2>Paiements en attente</h2>
      <table>
        <thead>
          <tr><th>Client</th><th>Bien</th><th>Reste à percevoir</th></tr>
        </thead>
        <tbody>${items}</tbody>
      </table>
    </section>`
}

/**
 * Trois mentions non négociables sur ce que le document montre et ne montre
 * pas :
 * - la colonne « Pièce » lit l’état **au moment de l’édition**, alors que le
 *   nom et le téléphone sont un instantané figé à la réservation — deux
 *   horizons temporels différents sur la même ligne ;
 * - Wave est le seul fournisseur de paiement enregistré : un règlement en
 *   espèces au comptoir n’a aucune trace de paiement et apparaît comme non
 *   encaissé sans être un impayé ;
 * - le document expose des données personnelles et doit être traité comme
 *   tel.
 */
function renderFooterNotes(): string {
  return `
    <section>
      <p>L’état de la colonne « Pièce » reflète la situation au moment de l’édition du document, alors que le nom et le téléphone du client sont figés au moment de la réservation.</p>
      <p>Wave est l’unique fournisseur de paiement enregistré par la plateforme : un séjour réglé en espèces au comptoir n’a aucun paiement enregistré et apparaît comme non encaissé, sans qu’il s’agisse d’un impayé.</p>
      <p>Ce document contient des données personnelles et doit être conservé
      en conséquence.</p>
    </section>`
}

export function renderReservationsReport(
  rows: readonly ReservationRow[],
  context: ReportContext
): string {
  if (rows.length === 0) {
    return renderDocument({
      title: 'Relevé des réservations',
      context,
      sections: ['<section><p>Aucune réservation sur la période.</p></section>'],
    })
  }

  const sections = [
    renderKeyFigures(rows),
    renderReservationsTable(rows),
    renderPendingPayments(rows),
    renderFooterNotes(),
  ]

  return renderDocument({ title: 'Relevé des réservations', context, sections })
}
