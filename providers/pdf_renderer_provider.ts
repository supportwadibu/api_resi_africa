import { closePdfRenderer } from '#services/pdf_renderer'

import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Ferme le navigateur de rendu PDF à l'arrêt du serveur.
 *
 * Le navigateur Chromium est lancé paresseusement au premier rapport et vit
 * ensuite pour toute la durée du process. Sans cette fermeture, chaque
 * redéploiement ou `SIGTERM` laisserait derrière lui un process Chromium
 * orphelin : le process Node s'arrête, l'enfant lui survit. Sur un VPS qui
 * redémarre souvent, ces zombies s'accumulent jusqu'à épuiser la mémoire.
 *
 * Aucun `boot` : démarrer le navigateur au boot ferait payer son lancement à
 * chaque instance, y compris aux workers et aux crons qui n'éditent jamais de
 * rapport.
 */
export default class PdfRendererProvider {
  constructor(protected app: ApplicationService) {}

  async shutdown() {
    const logger = await this.app.container.make('logger')

    try {
      await closePdfRenderer()
    } catch (error) {
      // Un navigateur déjà mort ou injoignable ne doit pas empêcher l'arrêt :
      // l'objectif est de ne pas laisser de zombie, pas de garantir une
      // fermeture propre au prix d'un process qui refuse de s'éteindre.
      logger.error({ err: error }, 'Échec de la fermeture du navigateur de rendu PDF')
    }
  }
}
