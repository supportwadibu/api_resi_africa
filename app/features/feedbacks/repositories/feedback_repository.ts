import Feedback, { type FeedbackContext, type FeedbackRecord } from '#models/feedback'

import type {
  AdminFeedbackDto,
  CreateFeedbackInput,
  FeedbackDto,
  ListFeedbacksInput,
  UpdateFeedbackStatusInput,
} from '../dto/feedback.dto.ts'

/**
 * Contexte technique normalisé.
 *
 * Chaque champ est facultatif et retombe sur `null` : un feedback envoyé par
 * une version de l'application qui n'enverrait pas encore — ou plus — l'un de
 * ces champs doit rester lisible dans le back-office.
 */
function toContext(input: CreateFeedbackInput['context']): FeedbackContext {
  return {
    app_version: input?.app_version ?? null,
    flavor: input?.flavor ?? null,
    platform: input?.platform ?? null,
    os_version: input?.os_version ?? null,
    device_model: input?.device_model ?? null,
  }
}

export class FeedbackRepository {
  static toDto(doc: FeedbackRecord): FeedbackDto {
    return {
      id: doc._id,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      // `status` est arrivé avec le back-office : les tout premiers feedbacks
      // n'en portent pas et doivent se présenter comme non traités.
      status: doc.status ?? 'new',
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  static toAdminDto(doc: FeedbackRecord): AdminFeedbackDto {
    return {
      ...FeedbackRepository.toDto(doc),
      user_id: doc.user_id,
      user_snapshot: {
        full_name: doc.user_snapshot?.full_name ?? '',
        phone: doc.user_snapshot?.phone ?? null,
        email: doc.user_snapshot?.email ?? null,
      },
      admin_note: doc.admin_note ?? null,
      context: toContext(doc.context),
    }
  }

  async findById(id: string): Promise<FeedbackRecord | null> {
    return Feedback.findById(id)
  }

  async create(
    input: CreateFeedbackInput & {
      user_snapshot: { full_name: string; phone: string | null; email: string | null }
    }
  ): Promise<FeedbackRecord> {
    return Feedback.create({
      user_id: input.user_id,
      user_snapshot: input.user_snapshot,
      type: input.type,
      title: input.title,
      message: input.message,
      context: toContext(input.context),
    })
  }

  async updateStatus(id: string, patch: UpdateFeedbackStatusInput): Promise<FeedbackRecord | null> {
    return Feedback.updateStatus(id, patch)
  }

  async paginate(input: ListFeedbacksInput): Promise<{ data: FeedbackRecord[]; total: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    return Feedback.paginate(
      { user_id: input.user_id, status: input.status, type: input.type },
      { limit: perPage, offset: (page - 1) * perPage }
    )
  }

  async lastCreatedAt(userId: string): Promise<Date | null> {
    return Feedback.lastCreatedAt(userId)
  }
}

export default FeedbackRepository
