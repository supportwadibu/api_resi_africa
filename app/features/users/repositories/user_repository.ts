import { SCOPE_READ_LIMIT } from '#features/managers/scope'
import { COLLECTIONS, getByIds } from '#firebase/firestore'
import AuthSession, { type RevokeReason } from '#models/auth_session'
import DeviceToken from '#models/device_token'
import ManagerAssignment, { type ManagerAssignmentRecord } from '#models/manager_assignment'
import Role from '#models/role'
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
      // Absent sur l'historique : non supprimé.
      deleted_at: doc.is_deleted ? (doc.deleted_at ?? null) : null,
      // Absents sur l'historique et sur une suppression par l'équipe.
      deletion_requested_by_user: Boolean(doc.is_deleted && doc.purge_scheduled_at),
      purge_scheduled_at: doc.is_deleted ? (doc.purge_scheduled_at ?? null) : null,
      deletion_reason: doc.is_deleted ? (doc.deletion_reason ?? null) : null,
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
    const filters = {
      role_id: input.role,
      is_active: input.is_active,
      is_verified: input.is_verified,
      deleted: input.deleted,
    }
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

  /**
   * Met le compte de côté : désactivé, marqué supprimé, restaurable.
   *
   * L'accès est coupé par `is_active`, que la connexion, le rafraîchissement
   * et le middleware d'authentification contrôlent déjà : aucun de ces flux
   * n'a à connaître la suppression.
   */
  async markDeleted(
    user: UserEntity,
    actorId: string,
    request?: { purge_scheduled_at: Date; reason: string | null }
  ): Promise<UserEntity | null> {
    return User.findByIdAndUpdate(user._id, {
      is_active: false,
      is_deleted: true,
      deleted_at: new Date(),
      deleted_by: actorId,
      active_before_deletion: user.is_active,
      purge_scheduled_at: request?.purge_scheduled_at ?? null,
      deletion_reason: request?.reason ?? null,
    })
  }

  /** Annule la suppression douce et rend au compte l'état d'avant. */
  async markRestored(user: UserEntity): Promise<UserEntity | null> {
    return User.findByIdAndUpdate(user._id, {
      // Repli sur actif : une suppression écrit toujours ce champ, son absence
      // ne peut venir que d'une écriture manuelle.
      is_active: user.raw.active_before_deletion ?? true,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      active_before_deletion: null,
      // Restaurer annule aussi une suppression demandée par l'utilisateur :
      // sans échéance, la tâche de purge ne le voit plus.
      purge_scheduled_at: null,
      deletion_reason: null,
    })
  }

  /** Ferme toutes les sessions du compte ; rend le nombre de sessions fermées. */
  async revokeSessions(id: string, reason: RevokeReason = 'admin'): Promise<number> {
    return AuthSession.revokeAllForUser(id, reason)
  }

  /**
   * Retire tous les appareils du compte : un compte en attente de purge ne
   * doit plus recevoir de notification, envoi groupé compris.
   */
  async removeDeviceTokens(id: string): Promise<void> {
    const tokens = await DeviceToken.findByUsers([id])
    await DeviceToken.removeByIds(tokens.map((token) => token._id))
  }

  /** Comptes dont la suppression demandée par l'utilisateur est échue. */
  async findDuePurges(now: Date, limit: number): Promise<UserRecord[]> {
    return User.findDuePurges(now, limit)
  }

  async countActiveSessions(id: string): Promise<number> {
    const sessions = await AuthSession.findActiveByUser(id)
    return sessions.length
  }

  /** Identifiant du document de rôle, `null` si `seed:roles` n'a pas été lancé. */
  async findRoleId(name: RoleName): Promise<string | null> {
    const role = await Role.findOne({ name })
    return role?._id ?? null
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await User.findOne({ email })
    return user?.raw ?? null
  }

  /** Lève un `Error` si l'e-mail ou le téléphone est déjà pris (voir `User.create`). */
  async createAccount(input: Partial<UserDocument>): Promise<UserRecord> {
    const user = await User.create(input)
    return user.raw
  }

  async findManagerAssignment(id: string): Promise<ManagerAssignmentRecord | null> {
    return ManagerAssignment.findByManagerId(id)
  }
}

export default UserRepository
