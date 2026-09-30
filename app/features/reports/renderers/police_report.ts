import { escapeHtml } from '#features/reports/renderers/layout'

import type { BookingDto } from '#features/bookings/dto/booking.dto'
import type { ClientDto } from '#features/clients/dto/client.dto'
import type { UserSummaryDto } from '#features/users/dto/user.dto'
import type { ClientIdDocumentType } from '#models/client'

/**
 * Registre des personnes hébergées, au format de la Brigade mondaine de la
 * Préfecture de police d'Abidjan.
 *
 * Distinct des trois autres rapports, qui sont des documents de gestion à page
 * de garde : celui-ci reproduit un formulaire administratif, en paysage, que
 * l'hôtelier remet tel quel. Il ne passe donc pas par `renderDocument`.
 */

/** Une ligne du registre : une personne, un séjour. */
export interface PoliceRow {
  full_name: string
  birth_date: Date | null
  birth_place: string | null
  nationality: string | null
  id_document: {
    type: ClientIdDocumentType | null
    number: string | null
    issued_at: Date | null
  }
  /** Domicile habituel. */
  address: string | null
  check_in_at: Date
  check_out_at: Date
  contact: string | null
}

export interface PoliceReportHeader {
  /** Nom de l'établissement : la résidence, à défaut le propriétaire. */
  hotel: string
  /** `null` : ligne laissée à remplir à la main. */
  commune: string | null
  /** Bornes inclusives de la période, en `YYYY-MM-DD`. */
  from_date: string
  to_date: string
}

const TIMEZONE = 'Africa/Abidjan'

/** `14/06/26` : le format du registre papier. */
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  timeZone: TIMEZONE,
})

/** Dates de l'état civil et de la pièce, sur quatre chiffres. */
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIMEZONE,
})

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIMEZONE,
})

const ID_DOCUMENT_LABELS: Record<ClientIdDocumentType, string> = {
  cni: 'CNI',
  passeport: 'Passeport',
  permis: 'Permis de conduire',
}

/**
 * Compose les lignes du registre depuis les séjours de la période.
 *
 * Deux sources, deux horizons temporels, et c'est voulu :
 *
 * - nom et contact viennent de `client_snapshot`, figés à la réservation —
 *   renommer une fiche ne réécrit pas l'historique ;
 * - l'identité (naissance, nationalité, pièce, domicile) vient de la fiche du
 *   carnet **telle qu'elle est à l'édition** : ce sont des données de la
 *   personne, que le propriétaire complète souvent après le séjour.
 *
 * Une réservation en ligne n'a pas de fiche au carnet — son `client_id` est un
 * compte de la plateforme : nom et contact viennent du compte, l'identité reste
 * vide plutôt qu'inventée.
 *
 * Seules les personnes **entrées** à l'instant de l'édition figurent : une
 * réservation future reste `confirmed` jusqu'à sa clôture — aucune transition
 * ne marque l'arrivée —, et le registre ne doit pas déclarer hébergé un client
 * qui n'est pas encore venu. L'heure d'entrée est le seul signal disponible.
 */
export function buildPoliceRows(
  bookings: readonly BookingDto[],
  clients: ReadonlyMap<string, ClientDto>,
  users: ReadonlyMap<string, UserSummaryDto>,
  now: Date = new Date()
): PoliceRow[] {
  return bookings
    .filter((booking) => (booking.check_in_at ?? booking.start_date).getTime() <= now.getTime())
    .map((booking) => {
      const client = clients.get(booking.client_id)
      const user = users.get(booking.client_id)

      return {
        full_name: booking.client?.full_name ?? client?.full_name ?? user?.full_name ?? '',
        birth_date: client?.birth_date ?? null,
        birth_place: client?.birth_place ?? null,
        nationality: client?.nationality ?? null,
        id_document: {
          type: client?.id_document_type ?? null,
          number: client?.id_document_number ?? null,
          issued_at: client?.id_document_issued_at ?? null,
        },
        address: client?.address ?? null,
        // Repli sur `start_date`/`end_date` : les réservations en ligne et
        // antérieures au comptoir ne portent pas l'heure.
        check_in_at: booking.check_in_at ?? booking.start_date,
        // La sortie réellement constatée prime : la police veut savoir quand
        // la personne est partie, pas quand elle devait partir.
        check_out_at: booking.actual_check_out_at ?? booking.check_out_at ?? booking.end_date,
        contact: booking.client?.phone ?? client?.phone ?? user?.phone ?? null,
      }
    })
    .sort((a, b) => a.check_in_at.getTime() - b.check_in_at.getTime())
}

/** « CNI n° C0012345 du 12/03/2021 », les parties inconnues omises. */
export function formatIdDocument(document: PoliceRow['id_document']): string {
  const parts: string[] = []
  if (document.type) parts.push(ID_DOCUMENT_LABELS[document.type])
  if (document.number) parts.push(`n° ${document.number}`)
  if (document.issued_at) parts.push(`du ${LONG_DATE.format(document.issued_at)}`)
  return parts.join(' ')
}

/**
 * Pied de page répété sur chaque feuille du registre.
 *
 * Neutre, sans la marque de la plateforme : c'est un formulaire administratif
 * remis à la police au nom de l'établissement. Il garde l'établissement et la
 * période, pour qu'une feuille détachée se rattache à son registre.
 */
export function policeFooterText(header: PoliceReportHeader): string {
  return `Liste des personnes hébergées · ${header.hotel} · du ${formatDay(header.from_date)} au ${formatDay(header.to_date)}`
}

/** `2026-06-01` → `01/06/2026`, sans passer par un fuseau. */
function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-')
  return `${day}/${month}/${year}`
}

/** Date et heure sur deux lignes, comme sur le registre papier. */
function dateAndTime(date: Date): string {
  const time = TIME.format(date).replace(':', 'h')
  return `${SHORT_DATE.format(date)}<br />${time}`
}

function text(value: string | null): string {
  return value ? escapeHtml(value) : ''
}

function birthCell(row: PoliceRow): string {
  const date = row.birth_date ? LONG_DATE.format(row.birth_date) : ''
  const place = text(row.birth_place)
  if (date && place) return `${date}<br />à ${place}`
  return date || place
}

/** Valeur d'un champ du formulaire, ou une ligne pointillée à remplir. */
function field(value: string | null): string {
  return value ? `<strong>${escapeHtml(value)}</strong>` : '<span class="blank"></span>'
}

/**
 * Noir et blanc, traits pleins, police système : c'est un formulaire
 * administratif photocopié et tamponné, pas un document de marque. Aucune
 * ressource externe, pour la même raison que les autres rapports — Chromium
 * rend hors ligne côté serveur.
 */
const STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #000;
    background: #fff;
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 8.5pt;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 5mm;
  }
  .head .side {
    text-align: center;
    font-weight: 700;
    line-height: 1.5;
    font-size: 8.5pt;
  }
  .head .motto {
    font-weight: 400;
    font-style: italic;
  }
  .head .rule {
    width: 30mm;
    margin: 1mm auto;
    border-top: 1px solid #000;
  }
  .form {
    margin-bottom: 4mm;
    line-height: 2;
    font-size: 9.5pt;
  }
  .form .row { display: flex; gap: 8mm; }
  .blank {
    display: inline-block;
    min-width: 55mm;
    border-bottom: 1px dotted #000;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    page-break-inside: auto;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th, td {
    border: 1px solid #000;
    padding: 1.5mm;
    vertical-align: middle;
  }
  th {
    font-size: 7.5pt;
    text-align: center;
    background: #f0f0f0;
  }
  td.num, td.date { text-align: center; white-space: nowrap; }
  .empty { text-align: center; padding: 6mm; font-style: italic; }
  .note { margin-top: 4mm; font-size: 7pt; color: #444; }
`

export function renderPoliceReport(rows: readonly PoliceRow[], header: PoliceReportHeader): string {
  const body =
    rows.length === 0
      ? '<tr><td colspan="9" class="empty">Aucune personne hébergée sur la période.</td></tr>'
      : rows
          .map(
            (row, index) => `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(row.full_name)}</td>
          <td>${birthCell(row)}</td>
          <td>${text(row.nationality)}</td>
          <td>${escapeHtml(formatIdDocument(row.id_document))}</td>
          <td>${text(row.address)}</td>
          <td class="date">${dateAndTime(row.check_in_at)}</td>
          <td class="date">${dateAndTime(row.check_out_at)}</td>
          <td>${text(row.contact)}</td>
        </tr>`
          )
          .join('')

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Liste des personnes hébergées</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <div class="head">
      <div class="side">
        MINISTÈRE DE L’INTÉRIEUR ET DE LA SÉCURITÉ<br />
        DIRECTION GÉNÉRALE DE LA POLICE NATIONALE<br />
        PRÉFECTURE DE POLICE D’ABIDJAN<br />
        BRIGADE MONDAINE<br />
        N° <span class="blank" style="min-width:25mm"></span> /MIS/DGPN/PPA/BM
      </div>
      <div class="side">
        RÉPUBLIQUE DE CÔTE D’IVOIRE
        <div class="rule"></div>
        <span class="motto">Union – Discipline – Travail</span>
        <div class="rule"></div>
      </div>
    </div>

    <div class="form">
      <div>COMMUNE DE : ${field(header.commune)}</div>
      <div>HÔTEL : ${field(header.hotel)}</div>
      <div>LISTE DES PERSONNES HÉBERGÉES DU : <strong>${formatDay(header.from_date)}</strong>
        AU : <strong>${formatDay(header.to_date)}</strong></div>
    </div>

    <table>
      <thead>
        <tr>
          <th rowspan="2">N°</th>
          <th rowspan="2">NOM ET PRÉNOMS</th>
          <th rowspan="2">DATE ET LIEU DE NAISSANCE</th>
          <th rowspan="2">NATIONALITÉ</th>
          <th rowspan="2">NATURE, NUMÉRO, DATE DE DÉLIVRANCE DE LA PIÈCE PRODUITE</th>
          <th rowspan="2">DOMICILE HABITUEL</th>
          <th colspan="2">DATE</th>
          <th rowspan="2">CONTACT</th>
        </tr>
        <tr>
          <th>D’ENTRÉE</th>
          <th>DE DÉPART</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>

    <p class="note">Nom et contact tels qu’enregistrés à la réservation ; identité et pièce
    telles qu’elles figurent au carnet à la date d’édition. Heures d’Abidjan.
    Document contenant des données personnelles.</p>
  </body>
</html>`
}
