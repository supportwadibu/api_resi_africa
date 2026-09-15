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

  browser = await puppeteer.launch({
    headless: true,
    // Requis en conteneur : sans `--no-sandbox`, Chromium refuse de démarrer
    // sous un utilisateur non privilégié sans namespaces.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  return browser
}

export async function renderPdf(html: string): Promise<Buffer> {
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
      // Les marges sont portées par `@page` dans le CSS du gabarit, qui sait
      // aussi placer en-têtes et pieds. Les fixer ici les dédoublerait.
      preferCSSPageSize: true,
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
