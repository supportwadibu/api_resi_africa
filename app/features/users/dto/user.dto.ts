import type { AuthChannel } from '#models/user'
import type { RoleName } from '#models/role'
import type { OwnerValidationStatus } from '#utils/enums/owner_validation_status'
import type { PaginationMeta } from '#features/feedbacks/dto/feedback.dto'
import type { SubscriptionDto } from '#features/subscriptions/dto/subscription.dto'

/**
 * Compte utilisateur, tous rôles confondus, tel que le back-office le lit.
 *
 * Ni mot de passe, ni identités externes : le back-office administre des
 * comptes, il n'a pas à manipuler de secret d'authentification.
 */
export interface UserDto {
  id: string
  role: RoleName
  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  auth_channel: AuthChannel
  is_verified: boolean
  is_active: boolean
  /**
   * Statut de validation administrative, `null` hors rôle `proprio`.
   *
   * Le champ est écrit sur tous les comptes avec la valeur par défaut
   * `pending` : l'exposer tel quel ferait passer un client pour un compte en
   * attente de validation.
   */
  owner_status: OwnerValidationStatus | null
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
}

/** Résumé affiché à côté d'une ligne d'une autre liste (réservation, logement…). */
export interface UserSummaryDto {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

/** Affectation d'un gérant, jointe à la fiche d'un compte `gerant`. */
export interface UserManagerAssignmentDto {
  owner: UserSummaryDto | null
  owner_id: string
  property_ids: string[]
  is_active: boolean
}

/**
 * Fiche complète d'un compte.
 *
 * Les blocs propres à un rôle valent `null` pour les autres : le back-office
 * teste leur présence plutôt que de redéduire le rôle.
 */
export interface UserDetailDto extends UserDto {
  /** Sessions ouvertes (non révoquées), tous appareils confondus. */
  active_sessions: number
  /** Rôle `proprio` : dossier déposé, décision et abonnement en cours. */
  owner: {
    profile_submitted: boolean
    validated_by: string | null
    validated_at: Date | null
    rejection_reason: string | null
    subscription: SubscriptionDto | null
  } | null
  /** Rôle `gerant` : pour qui il agit et sur quels logements. */
  manager_assignment: UserManagerAssignmentDto | null
}

/** Création d'un compte par un administrateur (`POST /admin/users`). */
export interface CreateUserInput {
  role: RoleName
  full_name: string
  email?: string | null
  phone?: string | null
  /** Mot de passe initial, en clair ; haché par le use case. */
  password: string
  /** Rôle `gerant` : propriétaire pour lequel il agit. */
  owner_id?: string | null
}

export interface ListUsersInput {
  role?: RoleName
  is_active?: boolean
  /** Recherche sur le nom, l'e-mail ou le téléphone. */
  q?: string
  page?: number
  per_page?: number
}

export interface ListUsersOutput {
  data: UserDto[]
  meta: PaginationMeta
}

/**
 * Modification d'un compte par un administrateur.
 *
 * Le rôle n'en fait pas partie : changer un `proprio` en `client` laisserait
 * derrière lui des logements, des réservations et un abonnement rattachés à un
 * compte qui ne peut plus les voir.
 */
export interface UpdateUserInput {
  full_name?: string
  email?: string
  phone?: string
  is_active?: boolean
}
