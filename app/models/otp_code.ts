import { RTDB_PATHS, ref } from '#firebase/rtdb'

export const OTP_CHANNELS = ['email', 'phone'] as const
export type OtpChannel = (typeof OTP_CHANNELS)[number]

export const OTP_PURPOSES = ['login', 'register', 'reset', '2fa'] as const
export type OtpPurpose = (typeof OTP_PURPOSES)[number]

export const OTP_DEFAULT_TTL_SECONDS = 10 * 60 // 10 minutes
export const OTP_DEFAULT_MAX_ATTEMPTS = 3

/**
 * OTP tel que stocké en RTDB.
 *
 * Les instants sont des millisecondes epoch : la Realtime Database n'a pas de
 * type date. La conversion vers `Date` se fait à la lecture.
 */
interface OtpCodeRaw {
  user_id: string
  /** Hash bcrypt du code OTP (jamais stocké en clair). */
  code: string
  channel: OtpChannel
  target: string
  purpose: OtpPurpose
  expires_at: number
  is_used: boolean
  used_at: number | null
  attempts_count: number
  max_attempts: number
  created_at: number
}

/** OTP exposé à l'application, avec de vraies dates. */
export interface OtpCodeRecord {
  _id: string
  user_id: string
  code: string
  channel: OtpChannel
  target: string
  purpose: OtpPurpose
  expires_at: Date
  is_used: boolean
  used_at: Date | null
  attempts_count: number
  max_attempts: number
  created_at: Date
}

/**
 * Chemin d'un OTP : `/otp_codes/{userId}/{purpose}`.
 *
 * Le métier n'autorise qu'un seul OTP actif par utilisateur et par usage — la
 * génération invalidait d'ailleurs les précédents. En faisant du couple
 * (utilisateur, usage) la clé, cette règle devient structurelle : écrire un
 * nouveau code remplace l'ancien, sans requête ni invalidation explicite.
 */
function otpRef(userId: string, purpose: OtpPurpose) {
  return ref(`${RTDB_PATHS.otpCodes}/${userId}/${purpose}`)
}

function toRecord(userId: string, purpose: OtpPurpose, raw: OtpCodeRaw): OtpCodeRecord {
  return {
    _id: `${userId}:${purpose}`,
    user_id: raw.user_id,
    code: raw.code,
    channel: raw.channel,
    target: raw.target,
    purpose: raw.purpose,
    expires_at: new Date(raw.expires_at),
    is_used: raw.is_used,
    used_at: raw.used_at === null ? null : new Date(raw.used_at),
    attempts_count: raw.attempts_count,
    max_attempts: raw.max_attempts,
    created_at: new Date(raw.created_at),
  }
}

/**
 * Codes à usage unique, en Realtime Database.
 *
 * Donnée éphémère par nature : durée de vie de dix minutes, écriture à chaque
 * demande de connexion, jamais interrogée autrement que par (utilisateur,
 * usage). Firestore la facturerait comme une donnée durable et imposerait un
 * index pour rien.
 */
const OtpCode = {
  /**
   * Enregistre un nouveau code, en écrasant celui qui existait pour ce couple
   * utilisateur/usage.
   */
  async create(input: {
    user_id: string
    code: string
    channel: OtpChannel
    target: string
    purpose: OtpPurpose
    expires_at?: Date
    max_attempts?: number
  }): Promise<OtpCodeRecord> {
    const now = Date.now()
    const raw: OtpCodeRaw = {
      user_id: input.user_id,
      code: input.code,
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      expires_at: input.expires_at?.getTime() ?? now + OTP_DEFAULT_TTL_SECONDS * 1000,
      is_used: false,
      used_at: null,
      attempts_count: 0,
      max_attempts: input.max_attempts ?? OTP_DEFAULT_MAX_ATTEMPTS,
      created_at: now,
    }

    await otpRef(input.user_id, input.purpose).set(raw)
    return toRecord(input.user_id, input.purpose, raw)
  },

  /** Code actif pour ce couple utilisateur/usage, `null` s'il a déjà servi. */
  async findActive(userId: string, purpose: OtpPurpose): Promise<OtpCodeRecord | null> {
    const snapshot = await otpRef(userId, purpose).get()
    const raw = snapshot.val() as OtpCodeRaw | null

    if (!raw || raw.is_used) return null
    return toRecord(userId, purpose, raw)
  },

  /**
   * Incrémente le compteur de tentatives de façon atomique.
   *
   * La transaction est nécessaire : deux vérifications simultanées avec un
   * `set` naïf n'incrémenteraient qu'une fois, offrant un essai gratuit à
   * chaque requête concurrente et affaiblissant la limite d'essais.
   */
  async incrementAttempts(userId: string, purpose: OtpPurpose): Promise<number> {
    const result = await otpRef(userId, purpose).transaction((current: OtpCodeRaw | null) => {
      if (!current) return current
      return { ...current, attempts_count: (current.attempts_count ?? 0) + 1 }
    })

    const raw = result.snapshot.val() as OtpCodeRaw | null
    return raw?.attempts_count ?? 0
  },

  /** Marque le code comme consommé. Le nœud est supprimé : il n'a plus d'usage. */
  async markUsed(userId: string, purpose: OtpPurpose): Promise<void> {
    await otpRef(userId, purpose).remove()
  },

  /** Invalide le code actif sans le consommer (nouvelle demande, annulation). */
  async invalidate(userId: string, purpose: OtpPurpose): Promise<void> {
    await otpRef(userId, purpose).remove()
  },

  /** Supprime tous les codes d'un utilisateur (suppression de compte). */
  async deleteAllForUser(userId: string): Promise<void> {
    await ref(`${RTDB_PATHS.otpCodes}/${userId}`).remove()
  },
}

export default OtpCode
