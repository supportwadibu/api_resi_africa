import AuditLog, { type AuditLogRecord } from '#models/audit_log'
import { auditOutcome } from '#utils/audit_entry'

import type { AuditLogDto, ListAuditLogsInput } from '../dto/audit_log.dto.ts'

export class AuditLogRepository {
  /**
   * Les premières traces, écrites quand seules les écritures sensibles
   * étaient auditées, ne portent que `action` (« VERBE motif ») : verbe,
   * route et issue s'en déduisent. Elles restent hors des filtres par verbe
   * ou par issue, faute du champ.
   */
  static toDto(doc: AuditLogRecord): AuditLogDto {
    const [actionMethod = '', ...actionRoute] = (doc.action ?? '').split(' ')

    return {
      id: doc._id,
      actor: doc.actor_id
        ? {
            id: doc.actor_id,
            role: doc.actor_role ?? null,
            full_name: doc.actor_snapshot?.full_name || null,
            contact: doc.actor_snapshot?.contact ?? null,
          }
        : null,
      method: doc.method ?? actionMethod,
      route: doc.route ?? actionRoute.join(' '),
      path: doc.path ?? null,
      params: doc.params ?? {},
      status: doc.status,
      outcome: doc.outcome ?? auditOutcome(doc.status),
      duration_ms: doc.duration_ms ?? null,
      error: doc.error ?? null,
      ip_address: doc.ip_address,
      user_agent: doc.user_agent,
      request_id: doc.request_id ?? null,
      created_at: doc.created_at,
    }
  }

  async findById(id: string): Promise<AuditLogRecord | null> {
    return AuditLog.findById(id)
  }

  async paginate(input: ListAuditLogsInput): Promise<{ data: AuditLogRecord[]; total: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    return AuditLog.paginate(
      {
        actor_id: input.actor_id,
        actor_role: input.actor_role,
        method: input.method,
        outcome: input.outcome,
        from: input.from,
        // Le dernier jour est inclus : la borne exclusive est le lendemain.
        to: input.to ? new Date(input.to.getTime() + 86_400_000) : undefined,
      },
      { limit: perPage, offset: (page - 1) * perPage }
    )
  }
}

export default AuditLogRepository
