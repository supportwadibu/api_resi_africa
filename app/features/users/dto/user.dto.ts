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
  /** Renseignée tant que le compte est supprimé (restaurable) ; `null` sinon. */
  deleted_at: Date | null
  /** Supprimé à la demande de l'utilisateur, et non par l'équipe. */
  deletion_requested_by_user: boolean
  /** Échéance de la suppression définitive automatique ; `null` sinon. */
  purge_scheduled_at: Date | null
  /** Motif laissé par l'utilisateur à sa demande, facultatif. */
  deletion_reason: string | null
  created_at: Date
  updated_at: Date
}

/**
 * Ce que l'utilisateur doit savoir avant de supprimer son compte
 * (`GET /auth/account/deletion`).
 *
 * `blockers` : ce qui empêche la suppression tant qu'il n'est pas réglé —
 * de l'argent encore dû, des voyageurs qui perdraient leur séjour.
 * `warnings` : ce que la suppression fera perdre, sans l'empêcher.
 */
export interface AccountDeletionPreviewDto {
  can_delete: boolean
  blockers: AccountDeletionNoticeDto[]
  warnings: AccountDeletionNoticeDto[]
  /** Délai, en jours, avant la suppression définitive. */
  grace_period_days: number
}

export interface AccountDeletionNoticeDto {
  code: string
  message: string
}

/** Réponse de `DELETE /auth/account`. */
export interface AccountDeletionDto {
  deleted_at: Date
  purge_scheduled_at: Date
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
  /** Inscription confirmée par OTP (ou compte créé vérifié). */
  is_verified?: boolean
  /** `true` : comptes supprimés seulement. L'absence ne filtre pas. */
  deleted?: boolean
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

/** Ensemble de données effacé avec le compte, et son volume. */
export interface PurgeItemDto {
  key: string
  label: string
  count: number
}

/**
 * Point d'attention avant une suppression définitive : de l'argent encore dû,
 * des séjours en cours. Signalé, jamais bloquant — l'administrateur décide.
 */
export interface PurgeWarningDto {
  code: string
  message: string
}

/** Aperçu d'une suppression définitive (`GET /admin/users/:id/purge`). */
export interface PurgePreviewDto {
  /** Ensembles effacés, vides exclus. */
  items: PurgeItemDto[]
  /** Données d'autres comptes qui citent celui-ci, conservées avec un nom figé. */
  kept: PurgeItemDto[]
  warnings: PurgeWarningDto[]
}

/** Bilan d'une suppression définitive (`DELETE /admin/users/:id/purge`). */
export interface PurgeReportDto {
  user_id: string
  items: PurgeItemDto[]
  /** Photos et pièces d'identité effacées chez l'hébergeur de fichiers. */
  files_deleted: number
}
