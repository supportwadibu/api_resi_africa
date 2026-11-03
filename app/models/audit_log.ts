import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

/**
 * Trace d'une requête traitée par l'API : qui, quoi, sur quelle cible, avec
 * quelle issue et, en cas d'échec, pourquoi.
 *
 * Écrite en complément des journaux applicatifs, qui tournent et se perdent :
 * celle-ci répond durablement à « qui a validé ce dossier, qui a marqué ce
 * retrait payé, qu'est-ce qui a produit cette erreur ». Le corps de la requête
 * et sa chaîne de requête ne sont jamais recopiés — l'un peut porter un mot de
 * passe ou une pièce d'identité, l'autre le secret des routes cron — ; seuls
 * l'action, la cible et l'issue le sont.
 */

export const AUDIT_OUTCOMES = ['success', 'client_error', 'server_error'] as const
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number]

export const AUDIT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export interface AuditActorSnapshot {
  full_name: string
  /** E-mail, à défaut téléphone : de quoi reconnaître le compte. */
  contact: string | null
}

export interface AuditError {
  /** Code stable de l'API (`booking_conflict`) ou de l'exception (`E_VALIDATION_ERROR`). */
  code: string | null
  message: string
  /** Champs refusés par la validation, `champ : règle`. */
  details: string[]
  /** Pile d'appel, pour une panne serveur seulement. */
  stack: string | null
}

export interface AuditLogDocument {
  actor_id: string | null
  actor_role: string | null
  /**
   * Nom et contact au moment de l'action, figés : un compte renommé ou
   * supprimé depuis doit rester identifiable dans sa trace.
   */
  actor_snapshot: AuditActorSnapshot | null
  /** `PATCH /api/v1/admin/withdrawals/:id/paid` : verbe et motif de route. */
  action: string
  method: string
  /** Motif de route, `/api/v1/admin/withdrawals/:id/paid`. */
  route: string
  /** Chemin effectif, sans chaîne de requête. */
  path: string
  /** Paramètres de route (`{ id }`), qui désignent la cible. */
  params: Record<string, string>
  status: number
  /** Dérivé du statut, stocké pour filtrer les échecs sans inégalité Firestore. */
  outcome: AuditOutcome
  duration_ms: number
  error: AuditError | null
  ip_address: string
  user_agent: string
  request_id: string | null
  created_at: Date
  /** Échéance de la politique TTL de Firestore, qui purge la collection. */
  expires_at: Date
}

export type AuditLogRecord = WithId<AuditLogDocument>

export interface AuditLogFilters {
  actor_id?: string
  actor_role?: string
  method?: string
  outcome?: AuditOutcome
  from?: Date
  to?: Date
}

function auditLogs() {
  return collection<AuditLogDocument>(COLLECTIONS.auditLogs)
}

const AuditLog = {
  async create(input: AuditLogDocument): Promise<void> {
    await auditLogs().add(toPayload(input) as unknown as AuditLogDocument)
  },

  async findById(id: string): Promise<AuditLogRecord | null> {
    if (!id) return null
    return toDoc<AuditLogDocument>(await auditLogs().doc(id).get())
  },

  async paginate(
    filters: AuditLogFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    let query = auditLogs() as FirebaseFirestore.Query<AuditLogDocument>

    if (filters.actor_id) query = query.where('actor_id', '==', filters.actor_id)
    if (filters.actor_role) query = query.where('actor_role', '==', filters.actor_role)
    if (filters.method) query = query.where('method', '==', filters.method)
    if (filters.outcome) query = query.where('outcome', '==', filters.outcome)
    if (filters.from) query = query.where('created_at', '>=', filters.from)
    if (filters.to) query = query.where('created_at', '<', filters.to)

    const [snapshot, total] = await Promise.all([
      query.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(query),
    ])

    return { data: toDocs<AuditLogDocument>(snapshot.docs), total }
  },
}

export default AuditLog
