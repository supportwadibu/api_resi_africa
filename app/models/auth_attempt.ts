import { RTDB_PATHS, encodeKey, ref, toRecords } from '#firebase/rtdb'

export const AUTH_ATTEMPT_TYPES = ['generate', 'verify'] as const
export type AuthAttemptType = (typeof AUTH_ATTEMPT_TYPES)[number]

export const AUTH_ATTEMPT_STATUSES = ['success', 'failed', 'expired', 'rate_limited'] as const
export type AuthAttemptStatus = (typeof AUTH_ATTEMPT_STATUSES)[number]

export const AUTH_ATTEMPT_CHANNELS = ['email', 'phone', 'google'] as const
export type AuthAttemptChannel = (typeof AUTH_ATTEMPT_CHANNELS)[number]

/**
 * Durée de conservation des tentatives.
 *
 * Mongo gardait 90 jours via un index TTL, à des fins d'audit. En RTDB, compter
 * suppose de charger le nœud entier : conserver trois mois d'historique
 * alourdirait chaque vérification de quota pour un usage qui, lui, ne regarde
 * qu'un quart d'heure. On ne garde donc ici que la fenêtre utile au rate-limit.
 *
 * Si l'audit long terme redevient nécessaire, la place naturelle est une
 * collection Firestore dédiée, écrite en parallèle et jamais lue à chaud.
 */
export const AUTH_ATTEMPT_RETENTION_SECONDS = 24 * 60 * 60

interface AuthAttemptRaw {
  user_id: string | null
  otp_id: string | null
  type: AuthAttemptType
  status: AuthAttemptStatus
  channel: AuthAttemptChannel
  target: string
  failure_reason: string | null
  ip_address: string
  user_agent: string
  created_at: number
}

export interface AuthAttemptRecord {
  _id: string
  user_id: string | null
  otp_id: string | null
  type: AuthAttemptType
  status: AuthAttemptStatus
  channel: AuthAttemptChannel
  target: string
  failure_reason: string | null
  ip_address: string
  user_agent: string
  created_at: Date
}

/**
 * Tentatives groupées par cible : `/auth_attempts/{target}/{pushId}`.
 *
 * Le rate-limit interroge toujours par `target` (e-mail ou téléphone). Ce
 * regroupement borne la lecture aux seules tentatives de la cible concernée,
 * là où une liste à plat obligerait à parcourir toute la base.
 *
 * Les clés générées par `push()` sont ordonnées chronologiquement, ce qui rend
 * les requêtes par plage temporelle possibles sans index secondaire.
 */
function targetRef(target: string) {
  return ref(`${RTDB_PATHS.authAttempts}/${encodeKey(target)}`)
}

/**
 * Journal des tentatives d'authentification, en Realtime Database.
 *
 * Écritures très fréquentes (chaque login, chaque envoi d'OTP), lectures
 * strictement bornées dans le temps : le profil type d'une donnée éphémère.
 */
const AuthAttempt = {
  async create(input: {
    user_id?: string | null
    otp_id?: string | null
    type: AuthAttemptType
    status: AuthAttemptStatus
    channel: AuthAttemptChannel
    target: string
    failure_reason?: string | null
    ip_address: string
    user_agent: string
  }): Promise<AuthAttemptRecord> {
    const raw: AuthAttemptRaw = {
      user_id: input.user_id ?? null,
      otp_id: input.otp_id ?? null,
      type: input.type,
      status: input.status,
      channel: input.channel,
      target: input.target,
      failure_reason: input.failure_reason ?? null,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      created_at: Date.now(),
    }

    const pushed = await targetRef(input.target).push(raw)

    return {
      ...raw,
      _id: pushed.key ?? '',
      created_at: new Date(raw.created_at),
    }
  },

  /**
   * Compte les tentatives d'un type donné pour une cible, depuis un instant.
   *
   * Le filtre temporel est appliqué côté serveur via `orderByChild`, ce qui
   * évite de rapatrier l'historique complet de la cible. Le tri par `type` se
   * fait ensuite en mémoire : RTDB n'accepte qu'un seul critère d'ordre, et le
   * volume concerné — les tentatives d'une cible sur une fenêtre courte —
   * reste négligeable.
   */
  async countSince(target: string, type: AuthAttemptType, since: Date): Promise<number> {
    const snapshot = await targetRef(target)
      .orderByChild('created_at')
      .startAt(since.getTime())
      .get()

    const records = toRecords<AuthAttemptRaw>(snapshot.val())
    return records.filter((r) => r.type === type).length
  },

  /** Tentatives récentes d'une cible, les plus récentes d'abord. */
  async findRecentByTarget(target: string, limit = 50): Promise<AuthAttemptRecord[]> {
    const snapshot = await targetRef(target).orderByChild('created_at').limitToLast(limit).get()

    return toRecords<AuthAttemptRaw>(snapshot.val())
      .map((r) => ({ ...r, created_at: new Date(r.created_at) }))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
  },

  /**
   * Purge les tentatives dépassant la durée de rétention.
   *
   * RTDB n'a pas d'expiration automatique : à appeler depuis une tâche
   * planifiée (Cloud Scheduler ou cron applicatif).
   */
  async purgeExpired(target: string): Promise<number> {
    const cutoff = Date.now() - AUTH_ATTEMPT_RETENTION_SECONDS * 1000

    const snapshot = await targetRef(target).orderByChild('created_at').endAt(cutoff).get()

    const stale = toRecords<AuthAttemptRaw>(snapshot.val())
    if (stale.length === 0) return 0

    const updates: Record<string, null> = {}
    for (const record of stale) {
      updates[record._id] = null
    }
    await targetRef(target).update(updates)

    return stale.length
  },
}

export default AuthAttempt
