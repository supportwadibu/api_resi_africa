import { createHash } from 'node:crypto'

import { FieldValue } from 'firebase-admin/firestore'

import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import { COLLECTIONS, collection, db, toDocs, toPayload, type WithId } from '#firebase/firestore'

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
 *
 * Les jetons sont aussi recopiés sur la fiche du compte (`users.fcm_tokens`),
 * pour être lisibles avec ses autres données. Cette copie est informative :
 * l'envoi lit cette collection-ci, seule à savoir le rôle et la plateforme.
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

/** Champ de la fiche du compte qui porte la copie de ses jetons. */
export const USER_TOKENS_FIELD = 'fcm_tokens'

function deviceTokens() {
  return collection<DeviceTokenDocument>(COLLECTIONS.deviceTokens)
}

/** Identifiant de document d'un jeton : un jeton FCM contient `:` et `/`. */
export function deviceTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Écritures à faire sur les fiches de comptes quand un jeton change de main.
 *
 * Extraite pour être éprouvée sans Firestore. [current] est l'appareil tel
 * qu'enregistré, [nextUserId] le compte qui le prend (`null` : il est retiré).
 * Un téléphone qui passe d'un compte à l'autre quitte la fiche du premier :
 * sans ce retrait, celle-ci afficherait un appareil qui ne reçoit plus rien.
 */
export function planTokenMirror(
  current: { user_id: string } | null,
  nextUserId: string | null
): Array<{ user_id: string; op: 'add' | 'remove' }> {
  const ops: Array<{ user_id: string; op: 'add' | 'remove' }> = []
  if (current && current.user_id !== nextUserId) {
    ops.push({ user_id: current.user_id, op: 'remove' })
  }
  if (nextUserId) ops.push({ user_id: nextUserId, op: 'add' })
  return ops
}

/** Applique un plan de recopie dans un lot d'écritures. */
function mirror(
  batch: FirebaseFirestore.WriteBatch,
  token: string,
  ops: ReturnType<typeof planTokenMirror>
) {
  const users = db().collection(COLLECTIONS.users)
  for (const { user_id: userId, op } of ops) {
    // `set` fusionné plutôt qu'`update` : un compte supprimé entre-temps ne
    // doit pas faire échouer l'enregistrement de l'appareil.
    batch.set(
      users.doc(userId),
      {
        [USER_TOKENS_FIELD]:
          op === 'add' ? FieldValue.arrayUnion(token) : FieldValue.arrayRemove(token),
      },
      { merge: true }
    )
  }
}

const DeviceToken = {
  async upsert(input: Omit<DeviceTokenDocument, 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date()
    const ref = deviceTokens().doc(deviceTokenId(input.token))
    const existing = await ref.get()
    const current = existing.exists ? existing.data() : undefined

    const batch = db().batch()
    batch.set(
      ref,
      toPayload({
        ...input,
        created_at: current?.created_at ?? now,
        updated_at: now,
      }) as unknown as DeviceTokenDocument
    )
    mirror(batch, input.token, planTokenMirror(current ?? null, input.user_id))
    await batch.commit()
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
    const current = snapshot.data()
    if (!snapshot.exists || current?.user_id !== userId) return

    const batch = db().batch()
    batch.delete(ref)
    mirror(batch, token, planTokenMirror(current, null))
    await batch.commit()
  },

  /** Purge les jetons refusés définitivement par FCM, fiches comprises. */
  async removeByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return

    const snapshots = await db().getAll(...ids.map((id) => deviceTokens().doc(id)))
    const batch = db().batch()
    for (const snapshot of snapshots) {
      const current = snapshot.data() as DeviceTokenDocument | undefined
      if (!current) continue
      batch.delete(snapshot.ref)
      mirror(batch, current.token, planTokenMirror(current, null))
    }
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
