import env from '#start/env'
import puppeteer, { type Browser } from 'puppeteer'

/**
 * Rendu d'un document HTML en PDF.
 *
 * L'implémentation est confinée ici, comme `document_storage` confine
 * Cloudinary : les renderers composent du HTML et ignorent tout du moteur.
 * Remplacer Puppeteer ne toucherait que ce fichier.
 */

/**
 * Le navigateur est démarré une fois et réutilisé.
 *
 * Un lancement coûte environ 300 ms ; le payer à chaque rapport alourdirait
 * sensiblement le temps de réponse perçu. L'instance est partagée, chaque
 * rendu ouvrant son propre onglet.
 */
let browser: Browser | null = null

/**
 * Au-delà, le rendu est abandonné. Sans cette borne, une page qui ne se
 * stabilise jamais retiendrait un onglet et sa mémoire indéfiniment.
 */
const RENDER_TIMEOUT_MS = 30_000

async function getBrowser(): Promise<Browser> {
  if (browser?.connected) return browser

  try {
    browser = await puppeteer.launch({
      headless: true,
      // Requis en conteneur : sans `--no-sandbox`, Chromium refuse de démarrer
      // sous un utilisateur non privilégié sans namespaces.
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      // Chemin du binaire installé par le gestionnaire de paquets de l'image.
      //
      // Explicite plutôt qu'implicite : sans cette variable, Puppeteer cherche
      // le Chromium qu'il télécharge lui-même dans `~/.cache/puppeteer`, **hors
      // du projet**. Un hébergeur qui reconstruit l'environnement d'exécution
      // après le build — Render sans Dockerfile, par exemple — perd ce cache, et
      // chaque rapport échoue alors au lancement du navigateur.
      executablePath: env.get('PUPPETEER_EXECUTABLE_PATH'),
    })
  } catch (error) {
    // Le message par défaut (« Could not find Chrome ») ne dit pas où le binaire
    // était attendu ni comment le fournir, et l'appelant l'enveloppe ensuite
    // dans un « Réessayez » qui invite à répéter une panne définitive.
    throw new Error(
      'Chromium est introuvable : renseignez PUPPETEER_EXECUTABLE_PATH ' +
        `(valeur actuelle : ${env.get('PUPPETEER_EXECUTABLE_PATH') ?? 'non définie'}) ` +
        `ou installez le navigateur de Puppeteer. Cause : ${(error as Error).message}`,
      { cause: error }
    )
  }

  return browser
}

/**
 * Marges du document, en millimètres A4.
 *
 * Portées ici et non par `@page` dans le CSS : Chromium ne réserve de place à
 * `headerTemplate`/`footerTemplate` que dans les marges passées à `page.pdf()`,
 * et `preferCSSPageSize` les ferait ignorer — les templates se superposeraient
 * alors au contenu. La marge basse est la plus haute : elle loge le pied.
 */
const MARGIN = { top: '18mm', right: '16mm', bottom: '22mm', left: '16mm' }

/**
 * Options de rendu.
 *
 * `footerText` est un libellé libre, pas du HTML : le service ne connaît rien
 * au métier des rapports, il reçoit une ligne à répéter et se charge seul de
 * l'échapper et de la mettre en forme.
 */
export interface RenderPdfOptions {
  /** Répété en bas de chaque feuille, à gauche de « page X / Y ». */
  footerText?: string
}

/**
 * Gabarit du pied répété par Chromium.
 *
 * Deux contraintes propres aux templates, invisibles depuis le CSS du
 * document :
 *
 * - ils sont rendus dans un contexte isolé et **n'héritent pas** de la feuille
 *   de style de la page — tout style doit être inline ;
 * - leur taille de police par défaut est minuscule (quelques pixels) et doit
 *   être fixée explicitement, sinon le pied est illisible.
 *
 * Les classes `pageNumber` et `totalPages` sont substituées par Chromium à
 * l'impression : c'est le seul mécanisme dont dispose son moteur, qui
 * n'implémente pas le `counter(pages)` du CSS Paged Media.
 */
function buildFooterTemplate(text: string): string {
  // `box-sizing: border-box` avec un padding latéral, et non une marge : le
  // template occupe toute la largeur de la feuille, marges comprises, et une
  // marge s'ajouterait aux 100 % de large au lieu de s'y inscrire.
  return `<div style="box-sizing:border-box;width:100%;padding:2mm 16mm 0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:8pt;color:#8A8A9A;border-top:1px solid #E0E0E0;display:flex;justify-content:space-between;">
  <span>${escapeTemplateText(text)}</span>
  <span>page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`
}

/** Le template est interprété en HTML : un nom de résidence libre y entre. */
function escapeTemplateText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Rend un document HTML, éventuellement flanqué d'un pied de page répété.
 */
export async function renderPdf(html: string, options: RenderPdfOptions = {}): Promise<Buffer> {
  const activeBrowser = await getBrowser()
  const page = await activeBrowser.newPage()

  try {
    // `domcontentloaded` et non `networkidle0` : le document n'a aucune
    // ressource externe — polices et styles sont inlinés — et attendre le
    // silence réseau ajouterait une demi-seconde à chaque rapport.
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: RENDER_TIMEOUT_MS,
      margin: MARGIN,
      ...(options.footerText
        ? {
            displayHeaderFooter: true,
            // Un `headerTemplate` vide est obligatoire dès que
            // `displayHeaderFooter` est actif : sans lui, Chromium imprime son
            // en-tête par défaut, avec le titre du document et l'URL.
            headerTemplate: '<span></span>',
            footerTemplate: buildFooterTemplate(options.footerText),
          }
        : {}),
    })

    return Buffer.from(pdf)
  } finally {
    // L'onglet est fermé même en cas d'échec : un rendu interrompu qui laisse
    // sa page ouverte fait fuir la mémoire du navigateur partagé.
    await page.close()
  }
}

/** Fermeture propre, appelée à l'arrêt du serveur. */
export async function closePdfRenderer(): Promise<void> {
  await browser?.close()
  browser = null
}
