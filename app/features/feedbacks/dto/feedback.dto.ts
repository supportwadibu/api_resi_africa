import type { FeedbackContext, FeedbackStatus, FeedbackType } from '#models/feedback'

export interface FeedbackDto {
  id: string
  type: FeedbackType
  title: string
  message: string
  status: FeedbackStatus
  created_at: Date
  updated_at: Date
}

/**
 * Vue de l'équipe : l'auteur et le contexte technique s'ajoutent.
 *
 * L'auteur n'a pas besoin de se voir renvoyer sa propre identité, et la note
 * interne ne doit jamais sortir vers lui — d'où deux DTO plutôt qu'un seul avec
 * des champs facultatifs, qu'un oubli de filtrage aurait laissé fuiter.
 */
export interface AdminFeedbackDto extends FeedbackDto {
  user_id: string
  user_snapshot: {
    full_name: string
    phone: string | null
    email: string | null
  }
  admin_note: string | null
  context: FeedbackContext
}

export interface CreateFeedbackInput {
  user_id: string
  type: FeedbackType
  title: string
  message: string
  context?: {
    app_version?: string | null
    flavor?: string | null
    platform?: string | null
    os_version?: string | null
    device_model?: string | null
  }
}

export interface ListFeedbacksInput {
  user_id?: string
  status?: FeedbackStatus
  type?: FeedbackType
  page?: number
  per_page?: number
}

export interface ListMyFeedbacksOutput {
  data: FeedbackDto[]
  meta: PaginationMeta
}

export interface ListFeedbacksOutput {
  data: AdminFeedbackDto[]
  meta: PaginationMeta
}

export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface UpdateFeedbackStatusInput {
  status?: FeedbackStatus
  admin_note?: string | null
}
