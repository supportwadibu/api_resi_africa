import type { AuditError, AuditOutcome } from '#models/audit_log'

export interface AuditLogDto {
  id: string
  /** `null` pour une requête anonyme : route publique ou jeton refusé. */
  actor: {
    id: string
    role: string | null
    full_name: string | null
    contact: string | null
  } | null
  method: string
  route: string
  path: string | null
  params: Record<string, string>
  status: number
  outcome: AuditOutcome
  duration_ms: number | null
  error: AuditError | null
  ip_address: string
  user_agent: string
  request_id: string | null
  created_at: Date
}

export interface ListAuditLogsInput {
  actor_id?: string
  actor_role?: string
  method?: string
  outcome?: AuditOutcome
  /** Jours inclus, `AAAA-MM-JJ`, lus en UTC (le fuseau d'Abidjan). */
  from?: Date
  to?: Date
  page?: number
  per_page?: number
}

export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface ListAuditLogsOutput {
  data: AuditLogDto[]
  meta: PaginationMeta
}
