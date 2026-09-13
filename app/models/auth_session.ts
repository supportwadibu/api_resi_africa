import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

export const REVOKE_REASONS = ['logout', 'admin', 'suspicious'] as const
export type RevokeReason = (typeof REVOKE_REASONS)[number]

export const DEVICE_PLATFORMS = ['ios', 'android', 'web', 'unknown'] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export interface DeviceInfo {
  ip_address: string
  user_agent: string
  device_name: string | null
  platform: DevicePlatform
}

export interface AuthSessionDocument {
  user_id: string

  /** Hash SHA-256 du refresh token — sert aussi d'identifiant de document. */
  refresh_token: string
  access_token_jti: string

  expires_at: Date
  is_revoked: boolean
  revoked_at: Date | null
  revoke_reason: RevokeReason | null

  device_info: DeviceInfo

  last_used_at: Date
  created_at: Date
}

export type AuthSessionRecord = WithId<AuthSessionDocument>

function sessions() {
  return collection<AuthSessionDocument>(COLLECTIONS.authSessions)
}

/**
 * Sessions d'authentification.
 *
 * **Le hash du refresh token est l'identifiant du document.** Ce hash est déjà
 * unique et de longueur fixe : l'utiliser comme clé transforme la recherche par
 * refresh token — le chemin le plus fréquent — en lecture directe, sans requête
 * ni index, et fait respecter l'unicité que Firestore ne sait pas déclarer.
 *
 * `access_token_jti` reste indexé : le middleware JWT vérifie la révocation à
 * chaque requête authentifiée.
 */
const AuthSession = {
  async create(input: {
    user_id: string
    refresh_token: string
    access_token_jti: string
    device_info: DeviceInfo
    expires_at?: Date
  }): Promise<AuthSessionRecord> {
    const now = new Date()
    const payload: AuthSessionDocument = {
      user_id: input.user_id,
      refresh_token: input.refresh_token,
      access_token_jti: input.access_token_jti,
      expires_at: input.expires_at ?? new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      is_revoked: false,
      revoked_at: null,
      revoke_reason: null,
      device_info: input.device_info,
      last_used_at: now,
      created_at: now,
    }

    await sessions()
      .doc(input.refresh_token)
      .set(toPayload(payload) as unknown as AuthSessionDocument)
    return { ...payload, _id: input.refresh_token }
  },

  /** Lecture par hash de refresh token : accès direct par clé. */
  async findOne(filter: { refresh_token: string }): Promise<AuthSessionRecord | null> {
    const snapshot = await sessions().doc(filter.refresh_token).get()
    return toDoc<AuthSessionDocument>(snapshot)
  },

  /**
   * Révoque une session active et la retourne dans son état d'avant révocation.
   *
   * Équivalent du `findOneAndUpdate` conditionnel de Mongo : la transaction
   * garantit qu'un double logout concurrent ne révoque qu'une fois — le second
   * appel voit `is_revoked` déjà vrai et retourne `null`.
   */
  async revokeByRefreshToken(
    refreshToken: string,
    reason: RevokeReason = 'logout'
  ): Promise<AuthSessionRecord | null> {
    const docRef = sessions().doc(refreshToken)

    return sessions().firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(docRef)
      const session = toDoc<AuthSessionDocument>(snapshot)

      if (!session || session.is_revoked) return null

      tx.update(
        docRef,
        toPayload({
          is_revoked: true,
          revoked_at: new Date(),
          revoke_reason: reason,
        })
      )

      return session
    })
  },

  /**
   * Indique si l'access token identifié par ce `jti` appartient à une session
   * révoquée. Appelé à chaque requête authentifiée.
   */
  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    const snapshot = await sessions()
      .where('access_token_jti', '==', jti)
      .where('is_revoked', '==', true)
      .limit(1)
      .get()

    return !snapshot.empty
  },

  /** Sessions actives d'un utilisateur, pour l'écran « appareils connectés ». */
  async findActiveByUser(userId: string): Promise<AuthSessionRecord[]> {
    const snapshot = await sessions()
      .where('user_id', '==', userId)
      .where('is_revoked', '==', false)
      .get()

    return toDocs<AuthSessionDocument>(snapshot.docs)
  },

  /** Révoque toutes les sessions d'un utilisateur (déconnexion globale). */
  async revokeAllForUser(userId: string, reason: RevokeReason = 'admin'): Promise<number> {
    const snapshot = await sessions()
      .where('user_id', '==', userId)
      .where('is_revoked', '==', false)
      .get()

    if (snapshot.empty) return 0

    const batch = sessions().firestore.batch()
    const patch = toPayload({
      is_revoked: true,
      revoked_at: new Date(),
      revoke_reason: reason,
    })

    for (const doc of snapshot.docs) {
      batch.update(doc.ref, patch)
    }
    await batch.commit()

    return snapshot.size
  },

  async touchLastUsed(refreshToken: string): Promise<void> {
    await sessions()
      .doc(refreshToken)
      .update(toPayload({ last_used_at: new Date() }))
  },

  /**
   * Supprime les sessions expirées (un lot de `limit` au maximum).
   *
   * Mongo purgeait via un index TTL. L'équivalent Firestore exige le plan
   * Blaze, que le projet n'a pas : la purge passe donc par la commande
   * `purge:sessions`, à planifier.
   */
  async deleteExpired(limit = 500): Promise<number> {
    const snapshot = await sessions().where('expires_at', '<=', new Date()).limit(limit).get()

    if (snapshot.empty) return 0

    const batch = sessions().firestore.batch()
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()

    return snapshot.size
  },
}

export default AuthSession
