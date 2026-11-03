import type { AuditError, AuditLogDocument, AuditOutcome } from '#models/audit_log'

import type { HttpContext } from '@adonisjs/core/http'

/** Une pile au-delà ne dit plus rien d'utile et alourdit chaque document. */
const MAX_STACK_LENGTH = 4000

export function auditOutcome(status: number): AuditOutcome {
  if (status >= 500) return 'server_error'
  if (status >= 400) return 'client_error'
  return 'success'
}

/**
 * Cause d'un échec, lue dans la réponse envoyée puis dans l'exception.
 *
 * La réponse d'abord : un refus du middleware d'authentification n'est pas
 * une exception, seul son corps `{ code, message }` le décrit. Pour une panne
 * serveur, le message de l'exception l'emporte : en production, le corps ne
 * porte qu'un texte générique, inutile à qui cherche la cause.
 */
export function describeFailure(status: number, body: unknown, error: unknown): AuditError {
  const sent = (typeof body === 'object' && body !== null ? body : {}) as {
    code?: unknown
    message?: unknown
  }
  const thrown = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown
    message?: unknown
    stack?: unknown
    messages?: unknown
  }

  const asText = (value: unknown) => (typeof value === 'string' && value ? value : null)
  const serverFailure = status >= 500

  const message = serverFailure
    ? (asText(thrown.message) ?? asText(sent.message))
    : (asText(sent.message) ?? asText(thrown.message))

  // `messages` : forme des erreurs de VineJS, un élément par champ refusé.
  const details = Array.isArray(thrown.messages)
    ? thrown.messages.map((entry: { field?: unknown; rule?: unknown }) =>
        [entry.field, entry.rule].filter((part) => typeof part === 'string').join(' : ')
      )
    : []

  const stack = asText(thrown.stack)

  return {
    code: asText(sent.code) ?? asText(thrown.code),
    message: message ?? `Réponse HTTP ${status}`,
    details,
    stack: serverFailure && stack ? stack.slice(0, MAX_STACK_LENGTH) : null,
  }
}

/**
 * Entrée d'audit d'une requête terminée.
 *
 * `ctx.authUser` est lu après coup : posé par `auth()`, plus bas dans la
 * chaîne, il est absent d'une route publique ou d'un jeton refusé — la trace
 * reste alors anonyme, avec son IP.
 */
export function buildAuditEntry(
  ctx: HttpContext,
  options: { durationMs: number; error?: unknown; retentionDays: number; now?: Date }
): AuditLogDocument {
  const now = options.now ?? new Date()
  const status = ctx.response.getStatus()
  const method = ctx.request.method()
  const path = ctx.request.url()
  const route = ctx.route?.pattern ?? path
  const outcome = auditOutcome(status)
  const user = ctx.authUser

  return {
    actor_id: user?.id ?? null,
    actor_role: user?.role ?? null,
    actor_snapshot: user
      ? { full_name: user.full_name ?? '', contact: user.email ?? user.phone ?? null }
      : null,
    action: `${method} ${route}`,
    method,
    route,
    path,
    params: Object.fromEntries(
      Object.entries(ctx.params ?? {}).map(([key, value]) => [key, String(value)])
    ),
    status,
    outcome,
    duration_ms: options.durationMs,
    error:
      outcome === 'success' ? null : describeFailure(status, ctx.response.getBody(), options.error),
    ip_address: ctx.request.ip(),
    user_agent: ctx.request.header('user-agent') ?? 'unknown',
    request_id: ctx.request.id() ?? null,
    created_at: now,
    expires_at: new Date(now.getTime() + options.retentionDays * 86_400_000),
  }
}
