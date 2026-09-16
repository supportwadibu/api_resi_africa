import { COLLECTIONS, collection, toDoc, toPayload, type WithId } from '#firebase/firestore'

export const ROLE_NAMES = ['admin', 'proprio', 'client', 'gerant'] as const
export type RoleName = (typeof ROLE_NAMES)[number]

export interface RoleDocument {
  name: RoleName
  permissions: string[]
  description: string
  created_at: Date
}

export type RoleRecord = WithId<RoleDocument>

function roles() {
  return collection<RoleDocument>(COLLECTIONS.roles)
}

/**
 * Rôles applicatifs.
 *
 * Collection quasi statique — trois documents, jamais modifiés en exploitation.
 * L'identifiant de document est le nom du rôle (`admin`, `proprio`, `client`) :
 * la lecture par nom devient un accès direct, sans requête ni index, et
 * l'unicité découle de la clé elle-même — Firestore ne sachant pas exprimer
 * d'index unique.
 */
const Role = {
  /** Lecture par nom : accès direct, le nom étant la clé du document. */
  async findOne(filter: { name: RoleName }): Promise<RoleRecord | null> {
    const snapshot = await roles().doc(filter.name).get()
    return toDoc<RoleDocument>(snapshot)
  },

  async findById(id: string): Promise<RoleRecord | null> {
    if (!id) return null
    const snapshot = await roles().doc(id).get()
    return toDoc<RoleDocument>(snapshot)
  },

  async findAll(): Promise<RoleRecord[]> {
    const snapshot = await roles().get()
    return snapshot.docs
      .map((d) => toDoc<RoleDocument>(d))
      .filter((d): d is RoleRecord => d !== null)
  },

  /**
   * Crée ou met à jour un rôle. Utilisé par le seed ; `merge` rend l'opération
   * rejouable sans écraser des permissions ajoutées entre-temps.
   */
  async upsert(input: {
    name: RoleName
    permissions?: string[]
    description?: string
  }): Promise<RoleRecord> {
    const payload: RoleDocument = {
      name: input.name,
      permissions: input.permissions ?? [],
      description: input.description ?? '',
      created_at: new Date(),
    }

    await roles()
      .doc(input.name)
      .set(toPayload(payload) as unknown as RoleDocument, { merge: true })

    const created = await Role.findById(input.name)
    if (!created) {
      throw new Error(`Échec de la création du rôle "${input.name}".`)
    }
    return created
  },
}

export default Role
