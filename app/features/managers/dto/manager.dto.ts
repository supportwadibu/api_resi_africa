/**
 * Vue d'un compte gérant rendue au propriétaire.
 *
 * Le mot de passe et son empreinte n'y figurent **jamais** : le propriétaire
 * fixe le mot de passe initial, mais le relire ensuite — même haché — ferait
 * transiter un secret d'authentification sur une route de gestion.
 */
export interface ManagerDto {
  _id: string
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  property_ids: string[]
  created_at: Date
}

/** Forme minimale d'un compte utilisateur suffisante pour composer le DTO. */
export interface ManagerAccountView {
  _id: string
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  metadata: { created_by: string | null; created_at: Date; updated_at?: Date | null }
}

/** Forme minimale d'une affectation suffisante pour composer le DTO. */
export interface ManagerAssignmentView {
  property_ids: string[]
  is_active: boolean
}

export interface CreateManagerInput {
  owner_id: string
  full_name: string
  email?: string | null
  phone?: string | null
  password: string
  property_ids: string[]
}

export interface UpdateManagerInput {
  full_name?: string
  email?: string | null
  phone?: string | null
}

/**
 * Compose la vue d'un gérant à partir de son compte et de son affectation.
 *
 * Une affectation absente rend un périmètre vide et `is_active: false` : sans
 * affectation, le middleware `scope()` refuse déjà tout accès au gérant, et
 * l'afficher actif laisserait croire au propriétaire qu'il travaille.
 *
 * `is_active` croise les deux états : suspendre l'affectation suffit à couper
 * l'accès, désactiver le compte aussi.
 */
export function toManagerDto(
  account: ManagerAccountView,
  assignment: ManagerAssignmentView | null
): ManagerDto {
  return {
    _id: account._id,
    full_name: account.full_name,
    email: account.email ?? null,
    phone: account.phone ?? null,
    is_active: Boolean(assignment?.is_active) && account.is_active,
    property_ids: assignment?.property_ids ?? [],
    created_at: account.metadata.created_at,
  }
}
