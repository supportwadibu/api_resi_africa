import type { IdDocumentType } from '#utils/enums/id_document_type'
import type { OwnerValidationStatus } from '#utils/enums/owner_validation_status'

/**
 * DTO d'entrée/sortie pour les usecases Owner (utilisateurs de rôle "proprio").
 * Représentation primitivisée pour sérialisation JSON.
 */

export interface OwnerDto {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_verified: boolean
  is_active: boolean
  owner_status: OwnerValidationStatus
  validated_by: string | null
  validated_at: Date | null
  rejection_reason: string | null
  last_login_at: Date | null
  /**
   * Le dossier de validation a-t-il été déposé ?
   *
   * Distinct de `owner_status` : un compte reste `pending` aussi bien avant
   * qu'après le dépôt. C'est cette distinction qui permet au client de savoir
   * s'il doit relancer l'utilisateur ou lui annoncer une décision à venir.
   */
  profile_submitted: boolean
  created_at: Date
  updated_at: Date
}

/**
 * Dossier de validation d'un propriétaire, tel que renvoyé au client.
 *
 * Les images sont exposées en URLs signées à durée limitée, calculées à chaque
 * lecture : le chemin de stockage brut n'a pas à sortir de l'API.
 */
export interface OwnerProfileDto {
  full_name: string
  email: string | null
  phone: string | null
  avatar_url: string | null

  address: string | null
  city: string | null
  country: string | null

  id_document_type: IdDocumentType | null
  id_document_number: string | null
  id_document_front_url: string | null
  id_document_back_url: string | null

  /** Date de dépôt du dossier, `null` tant que rien n'a été soumis. */
  submitted_at: Date | null
  /** Le dossier est-il complet et déposé ? */
  is_submitted: boolean

  owner_status: OwnerValidationStatus
  rejection_reason: string | null
}

/** Entrée du dépôt de dossier. Les fichiers sont passés à part. */
export interface SubmitOwnerProfileInput {
  user_id: string
  full_name: string
  phone: string
  address?: string
  city?: string
  country?: string
  id_document_type: IdDocumentType
  id_document_number: string
}

export interface ValidateOwnerInput {
  owner_id: string
  /** ID de l'admin qui effectue la validation (audit). */
  admin_id: string
}

export interface RejectOwnerInput {
  owner_id: string
  admin_id: string
  reason: string
}

export interface ListOwnersInput {
  status?: OwnerValidationStatus
  page?: number
  per_page?: number
}

export interface ListOwnersOutput {
  data: OwnerDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
