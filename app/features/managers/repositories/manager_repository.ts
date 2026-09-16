import ManagerAssignment, { type ManagerAssignmentRecord } from '#models/manager_assignment'
import Property, { type PropertyRecord } from '#models/property'
import User, { type UserEntity } from '#models/user'

import type { ManagerAccountView } from '../dto/manager.dto.ts'

/** Rôle porté par un compte gérant. Aligné sur `ROLE_NAMES`. */
const MANAGER_ROLE_ID = 'gerant'

/** Borne de lecture du parc lors du contrôle d'appartenance. */
const OWNED_PROPERTIES_SCAN_LIMIT = 1000

/**
 * Seul point d'accès Firestore du parcours « gérants » côté propriétaire.
 *
 * Les use cases s'y adressent et ne touchent ni `users`, ni `properties`, ni
 * `manager_assignments` directement.
 */
export class ManagerRepository {
  /**
   * Logements du propriétaire, dans la forme minimale attendue par
   * `assertPropertiesOwned`.
   *
   * Seuls `_id` et `owner_id` sont retenus : la garde ne juge que
   * l'appartenance.
   *
   * La page est volontairement large — le parc doit être vu en entier, un
   * logement laissé hors de la page serait refusé à tort — et bornée par
   * `OWNED_PROPERTIES_SCAN_LIMIT`, sur le motif déjà employé par
   * `client_repository` et `promo_code_repository` : les plans plafonnent les
   * résidences, et aucun parc existant n'approche ce seuil.
   */
  async listOwnedProperties(ownerId: string): Promise<{ _id: string; owner_id: string }[]> {
    const { data } = await Property.paginate(
      { owner_id: ownerId },
      { limit: OWNED_PROPERTIES_SCAN_LIMIT, offset: 0 }
    )

    return data.map((doc: PropertyRecord) => ({ _id: doc._id, owner_id: doc.owner_id }))
  }

  /** Un compte existe-t-il déjà avec cet e-mail ou ce téléphone ? */
  async accountExists(input: { email?: string | null; phone?: string | null }): Promise<boolean> {
    if (input.email) {
      const byEmail = await User.findOne({ email: input.email })
      if (byEmail) return true
    }
    if (input.phone) {
      const byPhone = await User.findOne({ phone: input.phone })
      if (byPhone) return true
    }
    return false
  }

  async createAccount(input: {
    full_name: string
    email: string | null
    phone: string | null
    password: string
    auth_channel: 'email' | 'phone'
    created_by: string
  }): Promise<ManagerAccountView> {
    const created = await User.create({
      role_id: MANAGER_ROLE_ID,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      auth_channel: input.auth_channel,
      // Pas d'OTP : le propriétaire enregistre une personne qu'il connaît et
      // dont il a vérifié le numéro. Voir `docs/specs/gerant-design.md`.
      is_verified: true,
      is_active: true,
      metadata: { created_by: input.created_by, created_at: new Date(), updated_at: new Date() },
    })

    return ManagerRepository.toAccountView(created)
  }

  /** Lecture d'un compte gérant, sans considération de propriétaire. */
  async findAccount(managerId: string): Promise<ManagerAccountView | null> {
    const user = await User.findByIdAndRole(managerId, MANAGER_ROLE_ID)
    return user ? ManagerRepository.toAccountView(user) : null
  }

  async findAccounts(managerIds: readonly string[]): Promise<Map<string, ManagerAccountView>> {
    const accounts = await Promise.all(managerIds.map((id) => this.findAccount(id)))

    return new Map(
      accounts
        .filter((account): account is ManagerAccountView => account !== null)
        .map((account) => [account._id, account])
    )
  }

  async updateAccount(
    managerId: string,
    patch: { full_name?: string; email?: string | null; phone?: string | null }
  ): Promise<ManagerAccountView | null> {
    const user = await User.findByIdAndRole(managerId, MANAGER_ROLE_ID)
    if (!user) return null

    if (patch.full_name !== undefined) user.full_name = patch.full_name
    if (patch.email !== undefined) user.email = patch.email
    if (patch.phone !== undefined) user.phone = patch.phone

    await user.save()
    return ManagerRepository.toAccountView(user)
  }

  async findAssignment(managerId: string): Promise<ManagerAssignmentRecord | null> {
    return ManagerAssignment.findByManagerId(managerId)
  }

  async listAssignments(ownerId: string): Promise<ManagerAssignmentRecord[]> {
    return ManagerAssignment.findByOwner(ownerId)
  }

  async upsertAssignment(input: {
    owner_id: string
    manager_id: string
    property_ids: string[]
  }): Promise<ManagerAssignmentRecord> {
    return ManagerAssignment.upsert(input)
  }

  async replaceAssignmentProperties(
    managerId: string,
    propertyIds: string[]
  ): Promise<ManagerAssignmentRecord | null> {
    return ManagerAssignment.replaceProperties(managerId, propertyIds)
  }

  async setAssignmentActive(
    managerId: string,
    isActive: boolean
  ): Promise<ManagerAssignmentRecord | null> {
    return ManagerAssignment.setActive(managerId, isActive)
  }

  private static toAccountView(user: UserEntity): ManagerAccountView {
    return {
      _id: user._id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      is_active: user.is_active,
      metadata: user.metadata,
    }
  }
}

export default ManagerRepository
