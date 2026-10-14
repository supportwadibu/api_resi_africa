/* eslint-disable prettier/prettier */
import { AuthError } from '#utils/auth_error'
import { DomainError } from '#utils/domain_error'

import {
  ExceptionHandler,
  type HttpContext,
} from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

export default class HttpExceptionHandler extends ExceptionHandler {

  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    if (error instanceof AuthError || error instanceof DomainError) {
      return ctx.response.status(error.status).send({
        code: error.code,
        message: error.message,
      })
    }

    // Index Firestore manquant : c'est un défaut de déploiement, pas une erreur
    // métier. Le message brut de Firestore contient l'URL de création de
    // l'index — le perdre dans un 500 opaque rend la panne très difficile à
    // diagnostiquer depuis le client.
    if (this.isMissingIndexError(error)) {
      logger.error({ err: error }, 'Index Firestore manquant : requête refusée')

      return ctx.response.status(500).send({
        code: 'missing_firestore_index',
        message: this.debug
          ? (error as Error).message
          : 'Configuration serveur incomplète. Contactez le support.',
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * Reconnaît un refus d'index Firestore.
   *
   * Le SDK expose `code: 9` (`FAILED_PRECONDITION`) et un message qui commence
   * par « The query requires an index ».
   */
  private isMissingIndexError(error: unknown): boolean {
    if (!(error instanceof Error)) return false

    const code = (error as { code?: number | string }).code
    return code === 9 && /requires an index/i.test(error.message)
  }

  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
