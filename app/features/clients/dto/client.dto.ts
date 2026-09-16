import type { ClientIdDocumentType, ClientStatus } from '#models/client'

export interface ClientStatsDto {
  total_stays: number
  total_paid: number
  last_stay_at: Date | null
}

export interface ClientDto {
  id: string
  full_name: string
  phone: string
  whatsapp: string | null
  id_document_type: ClientIdDocumentType | null
  id_document_number: string | null
  /**
   * Présence des pièces, sans leur référence.
   *
   * L'application affiche un dossier complet ou en attente ; livrer le
   * `public_id` Cloudinary permettrait de forger des requêtes vers l'hébergeur
   * hors des URLs signées.
   */
  has_document_front: boolean
  has_document_back: boolean
  documents_status: 'complete' | 'pending'
  stats: ClientStatsDto
  status: ClientStatus
  /**
   * Acteur ayant saisi la fiche — un gérant —, `null` pour le propriétaire et
   * sur les fiches antérieures au rôle gérant.
   *
   * C'est ce champ qui retient une fiche dans le carnet de son créateur tant
   * qu'elle n'a aucune réservation : le perdre à la conversion ferait
   * disparaître une fiche saisie au comptoir, sans aucune erreur visible.
   */
  created_by: string | null
  created_at: Date
  updated_at: Date
  /** URLs signées, présentes seulement sur la lecture d'une fiche. */
  document_front_url?: string | null
  document_back_url?: string | null
}

export interface CreateClientInput {
  owner_id: string
  full_name: string
  phone: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
  /**
   * Acteur ayant saisi la fiche — un gérant —, `null` ou absent pour le
   * propriétaire. Posé par le contrôleur depuis `ctx.scope`, jamais par le
   * client. C'est aussi ce qui rend la fiche visible à son créateur avant sa
   * première réservation : voir `filterClientsForScope`.
   */
  created_by?: string | null
}

export interface UpdateClientInput {
  full_name?: string
  phone?: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
  status?: ClientStatus
}

export interface ListClientsInput {
  owner_id: string
  q?: string
  status?: ClientStatus
  page?: number
  per_page?: number
}

export interface ListClientsOutput {
  data: ClientDto[]
  meta: { total: number; perPage: number; currentPage: number; lastPage: number }
}

/**
 * Résultat du dédoublonnage.
 *
 * `exists: false` n'est pas une erreur : c'est le cas nominal d'un nouveau
 * client, et l'application enchaîne sur la saisie.
 */
export interface LookupClientOutput {
  exists: boolean
  client: ClientDto | null
}
