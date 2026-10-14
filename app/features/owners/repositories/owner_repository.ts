/* eslint-disable prettier/prettier */
import Role from '#models/role'
import User, { type UserEntity, type UserRecord } from '#models/user'

import type {
  ListOwnersInput,
  OwnerDto,
} from '../dto/owner.dto.ts'

/**
 * Encapsule les accès User filtrés sur le rôle "proprio".
 * Les usecases ne dépendent pas directement du modèle User.
 */
export class OwnerRepository {
  static toDto(doc: UserRecord): OwnerDto {
    return {
      id: doc._id,
      full_name: doc.full_name,
      email: doc.email ?? null,
      phone: doc.phone ?? null,
      avatar_url: doc.avatar_url ?? null,
      is_verified: doc.is_verified,
      is_active: doc.is_active,
      owner_status: doc.owner_status,
      validated_by: doc.validated_by ?? null,
      validated_at: doc.validated_at ?? null,
      rejection_reason: doc.rejection_reason ?? null,
      last_login_at: doc.last_login_at ?? null,
      // Les comptes créés avant l'introduction du dossier n'ont pas de bloc
      // `profile` complet : l'optionnalité évite de les faire échouer ici.
      profile_submitted: Boolean(doc.profile?.submitted_at),
      created_at: doc.metadata.created_at,
      updated_at: doc.metadata.updated_at,
    }
  }

  private static entityToDto(user: UserEntity): OwnerDto {
    return OwnerRepository.toDto(user.raw)
  }

  /**
   * Identifiant du rôle proprio, mis en cache.
   *
   * Le nom du rôle est l'identifiant de son document, la valeur est donc
   * constante ; la lecture ne sert qu'à vérifier que le rôle existe bien.
   */
  private static proprioRoleId: string | null = null

  private static async getProprioRoleId(): Promise<string | null> {
    if (this.proprioRoleId) return this.proprioRoleId
    const role = await Role.findOne({ name: 'proprio' })
    if (!role) return null
    this.proprioRoleId = role.name
    return this.proprioRoleId
  }

  async findById(id: string): Promise<OwnerDto | null> {
    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return null

    const user = await User.findByIdAndRole(id, roleId)
    return user ? OwnerRepository.entityToDto(user) : null
  }

  /**
   * Entité mutable d'un propriétaire.
   *
   * Contrairement à `findById`, retourne l'entité et non un DTO : le dépôt de
   * dossier doit fusionner sur le profil existant, ce qu'un DTO aplati ne
   * permet pas.
   */
  async findEntityById(id: string): Promise<UserEntity | null> {
    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return null

    return User.findByIdAndRole(id, roleId)
  }

  async markValidated(ownerId: string, adminId: string): Promise<OwnerDto | null> {
    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return null

    // Vérifie l'existence et le rôle avant d'écrire : `update` sur un document
    // absent lève, et rien ne garantirait sinon qu'il s'agit d'un proprio.
    const existing = await User.findByIdAndRole(ownerId, roleId)
    if (!existing) return null

    const updated = await User.findByIdAndUpdate(ownerId, {
      owner_status: 'active',
      validated_by: adminId,
      validated_at: new Date(),
      rejection_reason: null,
    })

    return updated ? OwnerRepository.entityToDto(updated) : null
  }

  /**
   * Suspend un propriétaire dont l'essai s'est achevé sans validation.
   *
   * `is_active` est délibérément laissé intact : la suspension retire l'accès
   * aux fonctionnalités, pas le droit de se connecter. Le propriétaire doit
   * pouvoir consulter son état et régulariser son dossier.
   */
  async markSuspended(ownerId: string): Promise<OwnerDto | null> {
    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return null

    const existing = await User.findByIdAndRole(ownerId, roleId)
    if (!existing) return null

    const updated = await User.findByIdAndUpdate(ownerId, {
      owner_status: 'suspended',
    })

    return updated ? OwnerRepository.entityToDto(updated) : null
  }

  async markRejected(
    ownerId: string,
    adminId: string,
    reason: string
  ): Promise<OwnerDto | null> {
    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return null

    const existing = await User.findByIdAndRole(ownerId, roleId)
    if (!existing) return null

    const updated = await User.findByIdAndUpdate(ownerId, {
      owner_status: 'rejected',
      validated_by: adminId,
      validated_at: new Date(),
      rejection_reason: reason,
    })

    return updated ? OwnerRepository.entityToDto(updated) : null
  }

  async paginate(input: ListOwnersInput): Promise<{
    data: OwnerDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))

    const roleId = await OwnerRepository.getProprioRoleId()
    if (!roleId) return { data: [], total: 0, page, perPage }

    const [docs, total] = await Promise.all([
      User.findByRole(roleId, {
        status: input.status ?? null,
        limit: perPage,
        offset: (page - 1) * perPage,
      }),
      User.countByRole(roleId, input.status ?? null),
    ])

    return {
      data: docs.map((d) => OwnerRepository.toDto(d)),
      total,
      page,
      perPage,
    }
  }
}

export default OwnerRepository
