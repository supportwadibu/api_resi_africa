import {
  COLLECTIONS,
  countQuery,
  db,
  decodeDocument,
  encodeDocument,
  getByIds,
  type CollectionName,
} from '#firebase/firestore'
import { normalizePhone } from '#models/client'
import Role from '#models/role'
import User from '#models/user'

import type { ExportedDocument } from '../account_transfer.ts'
import type { PurgeStep } from '../purge_plan.ts'

/** Plafond d'un lot d'écritures Firestore. */
const BATCH_LIMIT = 500

/**
 * Accès Firestore de l'export et de l'import d'un compte.
 *
 * Les documents sont lus et écrits bruts, sans passer par les modèles : un
 * modèle ne rend que les champs qu'il connaît, et l'export doit restituer le
 * document entier — champs historiques compris — pour que l'import le
 * reproduise à l'identique.
 */
export class AccountTransferRepository {
  async readAccount(id: string): Promise<{ data: Record<string, unknown>; role: string } | null> {
    const snapshot = await db().collection(COLLECTIONS.users).doc(id).get()
    const data = snapshot.data()
    if (!data) return null

    const role = await Role.findById(String(data.role_id ?? ''))
    return { data: encodeDocument(data), role: role?.name ?? 'inconnu' }
  }

  async countStep(step: PurgeStep, userId: string): Promise<number> {
    const col = db().collection(step.collection)
    if (step.kind === 'doc') {
      const snapshot = await col.doc(userId).get()
      return snapshot.exists ? 1 : 0
    }
    return countQuery(col.where(step.field, '==', userId))
  }

  async readStep(step: PurgeStep, userId: string): Promise<ExportedDocument[]> {
    const col = db().collection(step.collection)

    if (step.kind === 'doc') {
      const snapshot = await col.doc(userId).get()
      const data = snapshot.data()
      return data ? [{ id: snapshot.id, data: encodeDocument(data) }] : []
    }

    const snapshot = await col.where(step.field, '==', userId).get()
    return snapshot.docs.map((doc) => ({ id: doc.id, data: encodeDocument(doc.data()) }))
  }

  /**
   * Compte déjà présent pour cette identité : par identifiant, puis e-mail,
   * puis téléphone — l'ordre où une collision est la plus certaine.
   */
  async findAccount(identity: {
    id: string
    email: string | null
    phone: string | null
  }): Promise<{ id: string; role_id: string; matched_by: 'id' | 'email' | 'phone' } | null> {
    const byId = await User.findById(identity.id)
    if (byId) return { id: byId._id, role_id: byId.role_id, matched_by: 'id' }

    if (identity.email) {
      const user = await User.findOne({ email: identity.email })
      if (user) return { id: user._id, role_id: user.role_id, matched_by: 'email' }
    }
    if (identity.phone) {
      const user = await User.findOne({ phone: identity.phone })
      if (user) return { id: user._id, role_id: user.role_id, matched_by: 'phone' }
    }

    return null
  }

  async roleExists(roleId: string): Promise<boolean> {
    return Boolean(roleId && (await Role.findById(roleId)))
  }

  async createAccount(id: string, data: Record<string, unknown>): Promise<void> {
    // `create` et non `set` : un compte apparu sous ce même identifiant entre
    // le contrôle et l'écriture ne doit pas être écrasé.
    await db().collection(COLLECTIONS.users).doc(id).create(decodeDocument(data))
  }

  async findExistingIds(
    collection: CollectionName,
    ids: readonly (string | null | undefined)[]
  ): Promise<Set<string>> {
    const docs = await getByIds<unknown>(collection, ids)
    return new Set(docs.keys())
  }

  /** Numéros déjà présents dans le carnet de ce propriétaire, normalisés. */
  async findClientPhones(ownerId: string): Promise<Set<string>> {
    const snapshot = await db()
      .collection(COLLECTIONS.clients)
      .where('owner_id', '==', ownerId)
      .get()
    return new Set(snapshot.docs.map((doc) => normalizePhone(String(doc.get('phone') ?? ''))))
  }

  /**
   * Écrit des documents sous leur identifiant d'origine, par lots.
   *
   * `set` plutôt que `create` : l'absence a été contrôlée juste avant, et un
   * `create` en échec ferait tomber tout le lot. Un lot échoué n'annule pas
   * les précédents ; l'import étant rejouable, le relancer reprend la suite.
   */
  async insertDocuments(collection: CollectionName, docs: readonly ExportedDocument[]) {
    const col = db().collection(collection)

    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const batch = db().batch()
      for (const doc of docs.slice(i, i + BATCH_LIMIT)) {
        batch.set(col.doc(doc.id), decodeDocument(doc.data))
      }
      await batch.commit()
    }
  }
}

export default AccountTransferRepository
