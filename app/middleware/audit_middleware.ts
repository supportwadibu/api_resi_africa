import AuditLog, { type AuditLogDocument } from '#models/audit_log'
import env from '#start/env'
import { buildAuditEntry } from '#utils/audit_entry'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Exception convertie en réponse par le handler, gardée pour l'audit. */
    requestError?: unknown
  }
}

/** Durée de conservation par défaut, en jours, avant purge par `purge-audit-logs`. */
const DEFAULT_RETENTION_DAYS = 180

/**
 * Requêtes qui ne disent rien de l'activité : le prévol CORS, les sondes de
 * santé appelées chaque minute, et la consultation du journal lui-même —
 * chaque page lue dans le back-office ajouterait des lignes à la page suivante.
 */
function isIgnored(ctx: HttpContext): boolean {
  const method = ctx.request.method()
  if (method === 'OPTIONS' || method === 'HEAD') return true

  const route = ctx.route?.pattern ?? ''
  if (route === '/health' || route === '/api/v1/health') return true
  return method === 'GET' && route.startsWith('/api/v1/admin/audit-logs')
}

/**
 * Piste d'audit de toute l'API : chaque requête routée, lecture comme
 * écriture, réussie ou refusée, de n'importe quel rôle ou anonyme.
 *
 * Posé en tête du middleware de routeur, il enveloppe l'authentification, la
 * limite de débit et la validation : un 401, un 429 ou un 422 se tracent comme
 * un succès. Une URL sans route n'est pas tracée — un robot qui sonde des
 * chemins au hasard remplirait la collection pour rien.
 */
export default class AuditMiddleware {
  constructor(
    // En test, aucune écriture : les tests ne contactent pas Firebase.
    private write: ((entry: AuditLogDocument) => Promise<void>) | null = app.inTest
      ? null
      : AuditLog.create
  ) {}

  async handle(ctx: HttpContext, next: NextFn) {
    if (isIgnored(ctx)) return next()

    const startedAt = process.hrtime.bigint()

    try {
      await next()
    } finally {
      // Le handler d'exceptions a déjà posé le statut quand `next()` rend la
      // main, y compris après une exception.
      this.record(ctx, Number((process.hrtime.bigint() - startedAt) / 1_000_000n))
    }
  }

  /**
   * L'écriture n'est pas attendue : la réponse n'a pas à patienter pour
   * Firestore. Une panne d'écriture ne doit pas non plus annuler une
   * opération déjà faite : elle est signalée dans les journaux, où la même
   * information subsiste.
   */
  private record(ctx: HttpContext, durationMs: number): void {
    if (!this.write) return

    const entry = buildAuditEntry(ctx, {
      durationMs,
      error: ctx.requestError,
      retentionDays: env.get('AUDIT_LOG_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS,
    })

    this.write(entry).catch((error) => {
      logger.error(
        { err: error, audit: { ...entry, error: entry.error?.code ?? null } },
        "Échec d'écriture de la piste d'audit"
      )
    })
  }
}
