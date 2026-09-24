import { SCOPE_READ_LIMIT } from '#features/managers/scope'
import { COLLECTIONS, getByIds } from '#firebase/firestore'
import AuthSession from '#models/auth_session'
import ManagerAssignment, { type ManagerAssignmentRecord } from '#models/manager_assignment'
import User, { type UserDocument, type UserEntity, type UserRecord } from '#models/user'

import type { RoleName } from '#models/role'
import type { ListUsersInput, UserDto, UserSummaryDto } from '../dto/user.dto.ts'

/**
 * Le compte correspond-il au terme recherché ?
 *
 * Firestore ne sait chercher ni une sous-chaîne ni sur plusieurs champs à la
 * fois : la recherche du back-office porte sur le nom, l'e-mail et le
 * téléphone, et se fait donc après lecture. Les espaces sont retirés du côté
 * téléphone, où l'on tape volontiers « 07 12 34 ».
 */
export function matchesUserSearch(
  doc: Pick<UserRecord, 'full_name' | 'email' | 'phone'>,
  term: string
): boolean {
  const needle = term.trim().toLowerCase()
  if (!needle) return true

  const compact = needle.replace(/\s/g, '')

  return (
    (doc.full_name ?? '').toLowerCase().includes(needle) ||
    (doc.email ?? '').toLowerCase().includes(needle) ||
    (compact.length > 0 && (doc.phone ?? '').includes(compact))
  )
}

export class UserRepository {
  static toDto(doc: UserRecord): UserDto {
    const role = doc.role_id as RoleName

    return {
      id: doc._id,
      role,
      full_name: doc.full_name,
      email: doc.email ?? null,
      phone: doc.phone ?? null,
      avatar_url: doc.avatar_url ?? null,
      auth_channel: doc.auth_channel ?? 'email',
      is_verified: doc.is_verified ?? false,
      // Absent = actif : c'est la valeur par défaut du modèle, et la lecture
      // d'un compte historique ne doit pas le faire paraître bloqué.
      is_active: doc.is_active ?? true,
      owner_status: role === 'proprio' ? doc.owner_status : null,
      last_login_at: doc.last_login_at ?? null,
      created_at: doc.metadata.created_at,
      updated_at: doc.metadata.updated_at,
    }
  }

  static toSummary(doc: Pick<UserRecord, '_id' | 'full_name' | 'email' | 'phone'>): UserSummaryDto {
    return {
      id: doc._id,
      full_name: doc.full_name,
      email: doc.email ?? null,
      phone: doc.phone ?? null,
    }
  }

  /**
   * Page de comptes.
   *
   * Sans terme de recherche, la pagination est déléguée à Firestore. Avec un
   * terme, les comptes répondant aux autres filtres sont lus dans la limite de
   * `SCOPE_READ_LIMIT`, filtrés puis découpés : `total` compte alors les
   * correspondances, pas les documents lus.
   */
  async paginate(input: ListUsersInput): Promise<{ data: UserDto[]; total: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))
    const filters = { role_id: input.role, is_active: input.is_active }
    const term = input.q?.trim()

    if (!term) {
      const { data, total } = await User.paginate(filters, {
        limit: perPage,
        offset: (page - 1) * perPage,
      })
      return { data: data.map(UserRepository.toDto), total }
    }

    const { data } = await User.paginate(filters, { limit: SCOPE_READ_LIMIT, offset: 0 })
    const matching = data.filter((doc) => matchesUserSearch(doc, term))

    return {
      data: matching.slice((page - 1) * perPage, page * perPage).map(UserRepository.toDto),
      total: matching.length,
    }
  }

  async findEntity(id: string): Promise<UserEntity | null> {
    return User.findById(id)
  }

  /** Résumés des comptes cités par une liste, indexés par identifiant. */
  async findSummaries(
    ids: readonly (string | null | undefined)[]
  ): Promise<Map<string, UserSummaryDto>> {
    const docs = await getByIds<UserDocument>(COLLECTIONS.users, ids)

    const out = new Map<string, UserSummaryDto>()
    for (const [id, doc] of docs) out.set(id, UserRepository.toSummary(doc))
    return out
  }

  /**
   * Un autre compte porte-t-il déjà cet e-mail ?
   *
   * Firestore n'a pas d'index unique : c'est ce contrôle qui porte l'unicité,
   * sur laquelle repose la connexion par e-mail.
   */
  async isEmailTaken(email: string, exceptId: string): Promise<boolean> {
    const other = await User.findOne({ email })
    return Boolean(other && other._id !== exceptId)
  }

  async isPhoneTaken(phone: string, exceptId: string): Promise<boolean> {
    const other = await User.findOne({ phone })
    return Boolean(other && other._id !== exceptId)
  }

  async save(user: UserEntity): Promise<void> {
    await user.save()
  }

  /** Ferme toutes les sessions du compte ; rend le nombre de sessions fermées. */
  async revokeSessions(id: string): Promise<number> {
    return AuthSession.revokeAllForUser(id, 'admin')
  }

  async countActiveSessions(id: string): Promise<number> {
    const sessions = await AuthSession.findActiveByUser(id)
    return sessions.length
  }

  async findManagerAssignment(id: string): Promise<ManagerAssignmentRecord | null> {
    return ManagerAssignment.findByManagerId(id)
  }
}

export default UserRepository
