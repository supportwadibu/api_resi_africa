import { createHash } from 'node:crypto'

import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import { COLLECTIONS, collection, toDocs, toPayload, type WithId } from '#firebase/firestore'

/**
 * Appareil qui reçoit les notifications push d'un compte.
 *
 * L'identifiant du document est un condensat du jeton FCM : Firestore n'a
 * pas d'index unique, et c'est l'identifiant qui porte l'unicité. Un
 * téléphone qui change de compte réécrit donc le même document — il ne
 * reçoit plus les notifications du compte précédent.
 *
 * Le rôle est recopié à l'enregistrement : l'envoi groupé « tous les
 * propriétaires » se lit alors en une requête sur cette collection, sans
 * relire tous les comptes.
 */
export interface DeviceTokenDocument {
  user_id: string
  role: string
  token: string
  platform: 'android' | 'ios' | 'web'
  created_at: Date
  updated_at: Date
}

export type DeviceTokenRecord = WithId<DeviceTokenDocument>

function deviceTokens() {
  return collection<DeviceTokenDocument>(COLLECTIONS.deviceTokens)
}

/** Identifiant de document d'un jeton : un jeton FCM contient `:` et `/`. */
export function deviceTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const DeviceToken = {
  async upsert(input: Omit<DeviceTokenDocument, 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date()
    const ref = deviceTokens().doc(deviceTokenId(input.token))
    const existing = await ref.get()

    await ref.set(
      toPayload({
        ...input,
        created_at: existing.exists ? (existing.data()?.created_at ?? now) : now,
        updated_at: now,
      }) as unknown as DeviceTokenDocument
    )
  },

  /**
   * Retire l'appareil d'un compte — à la déconnexion.
   *
   * Cadré sur l'utilisateur : un jeton deviné ne doit pas permettre de couper
   * les notifications d'un autre compte.
   */
  async removeForUser(token: string, userId: string): Promise<void> {
    const ref = deviceTokens().doc(deviceTokenId(token))
    const snapshot = await ref.get()
    if (snapshot.exists && snapshot.data()?.user_id === userId) await ref.delete()
  },

  /** Purge les jetons refusés définitivement par FCM. */
  async removeByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return
    const batch = deviceTokens().firestore.batch()
    for (const id of ids) batch.delete(deviceTokens().doc(id))
    await batch.commit()
  },

  /** Appareils de plusieurs comptes, par tranches de la limite de `in`. */
  async findByUsers(userIds: readonly string[]): Promise<DeviceTokenRecord[]> {
    const unique = [...new Set(userIds.filter(Boolean))]
    const out: DeviceTokenRecord[] = []

    for (let i = 0; i < unique.length; i += FIRESTORE_IN_LIMIT) {
      const snapshot = await deviceTokens()
        .where('user_id', 'in', unique.slice(i, i + FIRESTORE_IN_LIMIT))
        .get()
      out.push(...toDocs<DeviceTokenDocument>(snapshot.docs))
    }

    return out
  },

  async findByRole(role: string): Promise<DeviceTokenRecord[]> {
    const snapshot = await deviceTokens().where('role', '==', role).get()
    return toDocs<DeviceTokenDocument>(snapshot.docs)
  },
}

export default DeviceToken
