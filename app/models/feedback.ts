import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

/**
 * Avis et suggestions des utilisateurs sur l'application elle-même.
 *
 * Rien à voir avec les avis portant sur un bien : ici le propriétaire parle du
 * produit RESI — une idée d'amélioration, un dysfonctionnement, une gêne — et
 * le destinataire est l'équipe qui développe la plateforme. Les deux notions
 * sont séparées parce qu'elles n'ont ni le même auteur, ni le même lecteur, ni
 * le même cycle de vie : un avis sur un bien s'affiche publiquement, un
 * feedback produit se traite puis se clôt.
 */

export const FEEDBACK_TYPES = ['suggestion', 'bug', 'amelioration', 'autre'] as const
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

export const FEEDBACK_STATUSES = ['new', 'read', 'in_progress', 'closed'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

/**
 * Auteur figé au moment de l'envoi.
 *
 * Même principe que `client_snapshot` sur une réservation : l'équipe doit
 * pouvoir savoir qui a écrit même si la fiche a changé de nom depuis, ou si le
 * compte a disparu. Firestore n'ayant pas de jointure, aller relire `users`
 * à chaque affichage de la liste coûterait une lecture par ligne.
 */
export interface FeedbackUserSnapshot {
  full_name: string
  phone: string | null
  email: string | null
}

/**
 * Contexte technique de l'envoi, collecté par l'application.
 *
 * Un « le calendrier reste vide » sans version ni système est presque
 * inexploitable. L'utilisateur ne saisit aucun de ces champs et n'en voit rien.
 */
export interface FeedbackContext {
  app_version: string | null
  /** `dev` | `staging` | `prod` — un bug de staging n'a pas la même urgence. */
  flavor: string | null
  platform: string | null
  os_version: string | null
  device_model: string | null
}

export interface FeedbackDocument {
  user_id: string
  user_snapshot: FeedbackUserSnapshot

  type: FeedbackType
  title: string
  message: string

  status: FeedbackStatus
  /** Note interne de l'équipe. Jamais renvoyée à l'auteur. */
  admin_note: string | null

  context: FeedbackContext

  created_at: Date
  updated_at: Date
}

export type FeedbackRecord = WithId<FeedbackDocument>

function feedbacks() {
  return collection<FeedbackDocument>(COLLECTIONS.feedbacks)
}

export interface FeedbackFilters {
  user_id?: string
  status?: FeedbackStatus
  type?: FeedbackType
}

const Feedback = {
  async findById(id: string): Promise<FeedbackRecord | null> {
    if (!id) return null
    return toDoc<FeedbackDocument>(await feedbacks().doc(id).get())
  },

  async create(input: {
    user_id: string
    user_snapshot: FeedbackUserSnapshot
    type: FeedbackType
    title: string
    message: string
    context: FeedbackContext
  }): Promise<FeedbackRecord> {
    const now = new Date()

    const payload: FeedbackDocument = {
      user_id: input.user_id,
      user_snapshot: input.user_snapshot,
      type: input.type,
      title: input.title,
      message: input.message,
      status: 'new',
      admin_note: null,
      context: input.context,
      created_at: now,
      updated_at: now,
    }

    const docRef = await feedbacks().add(toPayload(payload) as unknown as FeedbackDocument)
    return { ...payload, _id: docRef.id }
  },

  /** Change le statut, et la note interne quand elle est fournie. */
  async updateStatus(
    id: string,
    patch: { status?: FeedbackStatus; admin_note?: string | null }
  ): Promise<FeedbackRecord | null> {
    const current = await Feedback.findById(id)
    if (!current) return null

    await feedbacks()
      .doc(id)
      .update(toPayload({ ...patch, updated_at: new Date() }))

    return Feedback.findById(id)
  },

  async paginate(
    filters: FeedbackFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: FeedbackRecord[]; total: number }> {
    let query = feedbacks() as FirebaseFirestore.Query<FeedbackDocument>

    if (filters.user_id) query = query.where('user_id', '==', filters.user_id)
    if (filters.status) query = query.where('status', '==', filters.status)
    if (filters.type) query = query.where('type', '==', filters.type)

    const [snapshot, total] = await Promise.all([
      query.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(query),
    ])

    return { data: toDocs<FeedbackDocument>(snapshot.docs), total }
  },

  /**
   * Date du dernier envoi d'un utilisateur, ou `null` s'il n'a jamais écrit.
   *
   * Sert la fenêtre anti-spam : sans elle, un double appui sur « Envoyer »
   * crée deux documents identiques que l'équipe devra départager à la main.
   */
  async lastCreatedAt(userId: string): Promise<Date | null> {
    const snapshot = await feedbacks()
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get()

    if (snapshot.empty) return null

    const doc = toDoc<FeedbackDocument>(snapshot.docs[0])
    return doc?.created_at ?? null
  },
}

export default Feedback
