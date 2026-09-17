import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

/**
 * Affectation d'un gérant : le propriétaire pour le compte de qui il agit, et
 * les logements qu'il sert.
 *
 * L'identifiant du document est le `manager_id`. Comme pour `role.ts`, la
 * lecture devient un accès direct sans requête ni index — elle a lieu à chaque
 * requête authentifiée d'un gérant — et l'unicité qui compte ici, un gérant ne
 * sert qu'un seul propriétaire, découle de la clé elle-même. Firestore ne
 * sachant pas exprimer d'index unique, c'est la seule garantie qui tienne.
 *
 * Voir `docs/specs/gerant-design.md`.
 */
export interface ManagerAssignmentDocument {
  owner_id: string
  manager_id: string
  /** Logements servis. Toujours des logements : l'affectation ignore les résidences. */
  property_ids: string[]
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type ManagerAssignmentRecord = WithId<ManagerAssignmentDocument>

function assignments() {
  return collection<ManagerAssignmentDocument>(COLLECTIONS.managerAssignments)
}

/**
 * Dédoublonne et ordonne une liste de logements.
 *
 * L'ordre rend deux affectations comparables, et le dédoublonnage évite qu'un
 * même logement compté deux fois ne fasse franchir la limite de 30 valeurs de
 * l'opérateur `in` sans raison.
 */
export function normalizePropertyIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))].sort()
}

const ManagerAssignment = {
  /** Accès direct : l'identifiant du document est le `manager_id`. */
  async findByManagerId(managerId: string): Promise<ManagerAssignmentRecord | null> {
    if (!managerId) return null
    return toDoc<ManagerAssignmentDocument>(await assignments().doc(managerId).get())
  },

  async findByOwner(ownerId: string): Promise<ManagerAssignmentRecord[]> {
    const snapshot = await assignments()
      .where('owner_id', '==', ownerId)
      .orderBy('created_at', 'desc')
      .get()

    return toDocs<ManagerAssignmentDocument>(snapshot.docs)
  },

  async upsert(input: {
    owner_id: string
    manager_id: string
    property_ids: string[]
    is_active?: boolean
  }): Promise<ManagerAssignmentRecord> {
    const now = new Date()
    const existing = await ManagerAssignment.findByManagerId(input.manager_id)

    const payload: ManagerAssignmentDocument = {
      owner_id: input.owner_id,
      manager_id: input.manager_id,
      property_ids: normalizePropertyIds(input.property_ids),
      is_active: input.is_active ?? true,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }

    await assignments()
      .doc(input.manager_id)
      .set(toPayload(payload) as unknown as ManagerAssignmentDocument, { merge: true })

    return { ...payload, _id: input.manager_id }
  },

  /**
   * Remplace le périmètre en entier.
   *
   * Remplacement et non fusion : le propriétaire envoie la liste complète des
   * logements qu'il veut affecter, si bien qu'un ajout et un retrait faits dans
   * le même geste deviennent une seule écriture et que l'état obtenu ne dépend
   * pas de l'ordre des requêtes.
   */
  async replaceProperties(
    managerId: string,
    propertyIds: string[]
  ): Promise<ManagerAssignmentRecord | null> {
    const existing = await ManagerAssignment.findByManagerId(managerId)
    if (!existing) return null

    const normalizedPropertyIds = normalizePropertyIds(propertyIds)
    await assignments()
      .doc(managerId)
      .update(toPayload({ property_ids: normalizedPropertyIds, updated_at: new Date() }))

    return { ...existing, property_ids: normalizedPropertyIds }
  },

  /** Suspend ou réactive sans supprimer l'historique ni le compte. */
  async setActive(managerId: string, isActive: boolean): Promise<ManagerAssignmentRecord | null> {
    const existing = await ManagerAssignment.findByManagerId(managerId)
    if (!existing) return null

    await assignments()
      .doc(managerId)
      .update(toPayload({ is_active: isActive, updated_at: new Date() }))

    return { ...existing, is_active: isActive }
  },
}

export default ManagerAssignment
