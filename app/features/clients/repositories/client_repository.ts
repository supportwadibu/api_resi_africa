import Client, { type ClientRecord } from '#models/client'

import type {
  ClientDto,
  CreateClientInput,
  ListClientsInput,
  UpdateClientInput,
} from '../dto/client.dto.ts'

/**
 * Plafond des lectures qui doivent filtrer en mémoire avant de paginer.
 *
 * Déjà appliqué à la recherche par terme avant le rôle gérant ; repris tel quel
 * plutôt que dupliqué en constante concurrente.
 */
const SCOPED_READ_LIMIT = 1000

export class ClientRepository {
  static toDto(doc: ClientRecord): ClientDto {
    return {
      id: doc._id,
      full_name: doc.full_name,
      phone: doc.phone,
      whatsapp: doc.whatsapp ?? null,
      id_document_type: doc.id_document_type ?? null,
      id_document_number: doc.id_document_number ?? null,
      has_document_front: Boolean(doc.id_document_front_public_id),
      has_document_back: Boolean(doc.id_document_back_public_id),
      documents_status: doc.documents_status ?? 'pending',
      stats: {
        total_stays: doc.stats?.total_stays ?? 0,
        total_paid: doc.stats?.total_paid ?? 0,
        last_stay_at: doc.stats?.last_stay_at ?? null,
      },
      status: doc.status ?? 'active',
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    }
  }

  async findById(id: string, ownerId: string): Promise<ClientRecord | null> {
    const doc = await Client.findById(id)
    // Un identifiant deviné ne doit pas révéler la fiche d'un autre carnet.
    if (!doc || doc.owner_id !== ownerId) return null
    return doc
  }

  async findByPhone(ownerId: string, phone: string): Promise<ClientRecord | null> {
    return Client.findByPhone(ownerId, phone)
  }

  async create(
    input: CreateClientInput & {
      id_document_front_public_id?: string | null
      id_document_back_public_id?: string | null
    }
  ): Promise<ClientRecord> {
    return Client.create(input)
  }

  async update(
    id: string,
    ownerId: string,
    patch: UpdateClientInput & {
      id_document_front_public_id?: string | null
      id_document_back_public_id?: string | null
    }
  ): Promise<ClientRecord | null> {
    return Client.update(id, ownerId, patch)
  }

  /**
   * Carnet entier, borné, pour les lectures qui doivent filtrer avant de
   * paginer.
   *
   * Même plafond que la recherche par terme ci-dessous, et pour la même
   * raison : Firestore ne sait exprimer ni « le nom contient » ni « le client a
   * séjourné dans l'un de ces logements », si bien que la restriction ne peut
   * s'appliquer qu'après lecture. Un carnet se compte en centaines de fiches.
   */
  async listAll(input: ListClientsInput): Promise<ClientRecord[]> {
    const term = input.q?.trim().toLowerCase()

    const all = await Client.paginate(
      { owner_id: input.owner_id, status: input.status },
      { limit: SCOPED_READ_LIMIT, offset: 0 }
    )

    if (!term) return all.data

    return all.data.filter(
      (doc) =>
        doc.full_name.toLowerCase().includes(term) || doc.phone.includes(term.replace(/\s/g, ''))
    )
  }

  /**
   * Page de clients, filtrée en mémoire sur le terme de recherche.
   *
   * Firestore ne sait pas chercher une sous-chaîne : `where('full_name', '>=')`
   * n'attrape qu'un préfixe, alors que le propriétaire cherche aussi bien par
   * nom que par numéro. Le carnet d'un propriétaire se compte en centaines de
   * fiches, ce qui rend le filtrage local sans incidence.
   */
  async paginate(input: ListClientsInput): Promise<{ data: ClientRecord[]; total: number }> {
    const page = Math.max(1, input.page ?? 1)
    const perPage = Math.min(100, Math.max(1, input.per_page ?? 20))
    const term = input.q?.trim().toLowerCase()

    if (!term) {
      return Client.paginate(
        { owner_id: input.owner_id, status: input.status },
        { limit: perPage, offset: (page - 1) * perPage }
      )
    }

    const matches = await this.listAll(input)

    return {
      data: matches.slice((page - 1) * perPage, page * perPage),
      total: matches.length,
    }
  }
}

export default ClientRepository
