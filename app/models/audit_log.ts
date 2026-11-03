import { COLLECTIONS, collection, toPayload, type WithId } from '#firebase/firestore'

/**
 * Trace d'une écriture sensible : décision d'un administrateur, mouvement
 * d'argent, changement d'un numéro de versement.
 *
 * Écrite en complément des journaux applicatifs, qui tournent et se perdent :
 * celle-ci répond durablement à « qui a validé ce dossier, qui a marqué ce
 * retrait payé ». Le corps de la requête n'est jamais recopié — il peut porter
 * un mot de passe ou une pièce d'identité — ; seuls l'action, la cible et
 * l'issue le sont.
 */
export interface AuditLogDocument {
  actor_id: string | null
  actor_role: string | null
  /** `PATCH /api/v1/admin/withdrawals/:id/paid` : verbe et motif de route. */
  action: string
  /** Paramètres de route (`{ id }`), qui désignent la cible. */
  params: Record<string, string>
  status: number
  ip_address: string
  user_agent: string
  request_id: string | null
  created_at: Date
}

export type AuditLogRecord = WithId<AuditLogDocument>

function auditLogs() {
  return collection<AuditLogDocument>(COLLECTIONS.auditLogs)
}

const AuditLog = {
  async create(input: Omit<AuditLogDocument, 'created_at'>): Promise<void> {
    const payload: AuditLogDocument = { ...input, created_at: new Date() }
    await auditLogs().add(toPayload(payload) as unknown as AuditLogDocument)
  },
}

export default AuditLog
