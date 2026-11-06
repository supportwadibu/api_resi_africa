import { COLLECTIONS, getByIds } from '#firebase/firestore'
import Client, { normalizePhone, type ClientRecord } from '#models/client'
import Role from '#models/role'
import User, { type UserDocument, type UserEntity } from '#models/user'

import type { ExportedOwner } from '../client_transfer.ts'

/** Accès Firestore de l'export et de l'import du carnet clients. */
export class ClientTransferRepository {
  findAllClients(): Promise<ClientRecord[]> {
    return Client.findAll()
  }

  /** Identité de chaque propriétaire cité, pour l'embarquer dans l'export. */
  async findOwnerIdentities(ownerIds: readonly string[]): Promise<Map<string, ExportedOwner>> {
    const users = await getByIds<UserDocument>(COLLECTIONS.users, ownerIds)
    const out = new Map<string, ExportedOwner>()

    for (const [id, user] of users) {
      out.set(id, {
        id,
        full_name: user.full_name ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
      })
    }

    return out
  }

  /**
   * Retrouve le propriétaire actuel de chaque identité exportée.
   *
   * D'abord par identifiant — la base n'a pas été vidée —, puis par e-mail,
   * puis par téléphone — le compte a été recréé. Seul un compte `proprio`
   * convient : rattacher un carnet à un client ou à un gérant qui porterait le
   * même numéro le rendrait invisible et l'exposerait à un tiers.
   */
  async resolveOwners(owners: readonly ExportedOwner[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const role = await Role.findOne({ name: 'proprio' })
    if (!role) return out

    const isOwner = (user: UserEntity | null): user is UserEntity =>
      Boolean(user && user.role_id === role._id)

    for (const owner of owners) {
      if (out.has(owner.id)) continue

      const email = owner.email?.trim().toLowerCase()
      const phone = owner.phone?.trim()

      const candidates = [
        () => User.findById(owner.id),
        () => (email ? User.findOne({ email }) : Promise.resolve(null)),
        () => (phone ? User.findOne({ phone }) : Promise.resolve(null)),
      ]

      for (const find of candidates) {
        const user = await find()
        if (isOwner(user)) {
          out.set(owner.id, user._id)
          break
        }
      }
    }

    return out
  }

  async findExistingIds(ids: readonly string[]): Promise<Set<string>> {
    const docs = await getByIds<unknown>(COLLECTIONS.clients, ids)
    return new Set(docs.keys())
  }

  /** Paires `owner_id:téléphone` déjà présentes dans ces carnets. */
  async findPhoneKeys(ownerIds: readonly string[]): Promise<Set<string>> {
    const records = await Client.findByOwners(ownerIds)
    return new Set(records.map((r) => `${r.owner_id}:${normalizePhone(r.phone)}`))
  }

  async findKnownUserIds(ids: readonly (string | null | undefined)[]): Promise<Set<string>> {
    const users = await getByIds<unknown>(COLLECTIONS.users, ids)
    return new Set(users.keys())
  }

  insertMany(records: readonly ClientRecord[]): Promise<void> {
    return Client.insertMany(records)
  }
}

export default ClientTransferRepository
