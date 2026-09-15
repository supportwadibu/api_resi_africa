import type { ReportContext } from '#features/reports/dto/report.dto'

/**
 * Échappe les caractères qui feraient basculer une saisie libre (nom de
 * client, de résidence) hors du texte HTML. Ordre important : `&` doit être
 * traité en premier, sinon les remplacements suivants ré-échapperaient le
 * `&` qu'ils viennent d'introduire.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const AMOUNT_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/**
 * Le franc CFA n'a pas de subdivision monétaire en usage : afficher des
 * centimes suggérerait une précision que la monnaie n'a pas.
 */
export function formatAmount(value: number): string {
  return `${AMOUNT_FORMATTER.format(Math.round(value))} FCFA`
}

/**
 * Ratio 0–1 vers un pourcentage entier. Le taux d'occupation ou de conversion
 * n'a pas besoin de décimale ici : le PDF vise un propriétaire qui compare
 * des mois entre eux, pas un pilotage à la décimale près.
 */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

/**
 * Durée en jours, arrondie au dixième.
 *
 * `moyen_sejour` est un quotient brut (`totalDays / bookings.length`) : imprimé
 * tel quel, « 4.333333333333333 j » s'afficherait sur un document que le
 * propriétaire présente à sa banque. Le dixième suffit à distinguer deux
 * périodes sans suggérer une précision que la donnée n'a pas.
 */
export function formatDays(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} j`
}

/**
 * Feuille de style commune aux trois rapports. Les couleurs sont reprises
 * telles quelles de `app_colors.dart`, seule source de vérité de la palette
 * produit, pour qu'un PDF et l'app mobile ne divergent jamais visuellement.
 * `--color-text` correspond à `AppColors.textPrimary` (pas `AppColors.black`,
 * réservée à un autre usage) et `--color-secondary` à `AppColors.textSecondary` :
 * ce sont les teintes que 31 écrans mobiles utilisent déjà pour le texte
 * courant et atténué, un rapport en noir pur aurait détonné visuellement.
 *
 * Aucune police ni feuille externe : Chromium rend ces PDF hors ligne côté
 * serveur, et une ressource distante indisponible se traduirait par une
 * police de repli silencieuse plutôt que par une erreur visible.
 */
const STYLE = `
  :root {
    --color-background: #F5F4F8;
    --color-text: #1A1A2E;
    --color-primary: #3322AC;
    --color-primary-dark: #0F074E;
    --color-border: #E0E0E0;
    --color-secondary: #8A8A9A;
    --color-card-background: #FFFFFF;
    --color-success: #059669;
    --color-warning: #D97706;
    --color-error: #DC2626;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: var(--color-background);
    color: var(--color-text);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
  }

  /*
   * Ni règle @page ni pied de page ici : les marges et le pied répété sont
   * portés par page.pdf() dans pdf_renderer.ts. Chromium n'accorde de place à
   * footerTemplate que dans les marges qu'on lui passe, et deux jeux de marges
   * se cumuleraient.
   */

  .cover {
    /*
     * Hauteur de la zone imprimable d'une A4 : 297mm moins les marges haute et
     * basse passées à page.pdf() (18 + 22). En vh, elle dépendrait du viewport
     * de rendu et non du papier ; en pourcentage, elle se résoudrait à auto,
     * le body n'ayant pas de hauteur propre — la page de garde cesserait
     * d'occuper sa feuille entière.
     */
    min-height: 257mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    page-break-after: always;
  }

  .cover .title {
    color: var(--color-primary-dark);
    font-size: 22pt;
    font-weight: 700;
    margin-bottom: 4mm;
  }

  .cover .owner {
    color: var(--color-primary);
    font-size: 14pt;
    margin-bottom: 2mm;
  }

  .cover .residence {
    font-size: 12pt;
    margin-bottom: 2mm;
  }

  .cover .period {
    color: var(--color-secondary);
    font-size: 11pt;
  }

  .cover .generated-at {
    margin-top: 8mm;
    color: var(--color-secondary);
    font-size: 9pt;
  }

  section {
    margin-bottom: 10mm;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    /* Autorise la coupure entre lignes d'un tableau long, contrairement à
       .cover qui doit rester d'un seul tenant. */
    page-break-inside: auto;
  }

  tr {
    page-break-inside: avoid;
  }

  thead {
    display: table-header-group;
  }

  th,
  td {
    border-bottom: 1px solid var(--color-border);
    padding: 2mm;
    text-align: left;
  }

  /*
   * auto-fit + minmax répartit les cartes sur autant de colonnes que la
   * largeur A4 (210mm, marges 18/16mm) en laisse tenir, sans jamais en
   * étirer une seule sur toute la ligne : 4 cartes (performance) tiennent
   * sur une rangée, 6 (bilan financier) se répartissent sur deux.
   */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(40mm, 1fr));
    gap: 4mm;
  }

  .card {
    background: var(--color-card-background);
    border: 1px solid var(--color-border);
    border-radius: 2mm;
    padding: 3mm;
    /* Une carte coupée en deux entre deux pages serait illisible. */
    page-break-inside: avoid;
  }

  .card-label {
    font-size: 8pt;
    color: var(--color-secondary);
  }

  .card-value {
    font-size: 13pt;
    font-weight: 700;
    color: var(--color-text);
  }
`

/**
 * Résout le libellé de résidence affiché en page de garde et en pied de
 * page. `null` signifie que le rapport porte sur tout le parc du
 * propriétaire, jamais une absence de donnée à masquer.
 */
function residenceLabel(context: ReportContext): string {
  return context.residence_name ?? 'Toutes mes résidences'
}

/**
 * Texte du pied de page répété : « RESI · <résidence> · <période> ».
 *
 * Exporté parce que le pied n'est pas imprimé par le HTML du document mais par
 * le `footerTemplate` de Puppeteer — seul mécanisme que Chromium sait répéter
 * sur chaque feuille. La spec fait de cette répétition une exigence : une
 * feuille détachée du rapport ne doit pas pouvoir passer pour celle d'un autre
 * mois.
 */
export function reportFooterText(context: ReportContext): string {
  return `RESI · ${residenceLabel(context)} · ${context.period.label}`
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Abidjan',
  }).format(date)
}

/**
 * Assemble le document complet : page de garde puis les sections fournies par
 * le renderer appelant, dans l'ordre reçu.
 *
 * Le pied de page n'y figure pas : il est répété page après page par Chromium
 * à l'impression, depuis `reportFooterText`.
 */
export function renderDocument(input: {
  title: string
  context: ReportContext
  sections: string[]
}): string {
  const { title, context, sections } = input
  const residence = residenceLabel(context)
  const owner = escapeHtml(context.owner_name)
  const safeResidence = escapeHtml(residence)
  const safeTitle = escapeHtml(title)

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${safeTitle}</title>
    <style>${STYLE}</style>
  </head>
  <body>
    <div class="cover">
      <div class="title">${safeTitle}</div>
      <div class="owner">${owner}</div>
      <div class="residence">${safeResidence}</div>
      <div class="period">${escapeHtml(context.period.label)}</div>
      <div class="generated-at">Édité le ${formatGeneratedAt(context.generated_at)}</div>
    </div>

    ${sections.join('\n')}
  </body>
</html>`
}
