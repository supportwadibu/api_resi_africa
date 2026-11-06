import { buildClientPayload, normalizePhone } from '#models/client'

import type { ClientIdDocumentType, ClientRecord, ClientStatus } from '#models/client'

/**
 * Export et réimport du carnet clients, tous propriétaires confondus.
 *
 * Sert à vider la base sans perdre les carnets : l'export est un fichier JSON
 * autonome, relu tel quel par l'import. Les règles de reprise vivent ici, en
 * fonctions pures, pour être éprouvées sans Firestore.
 */

/** Signature du fichier : un autre JSON déposé par erreur est refusé d'emblée. */
export const CLIENT_EXPORT_FORMAT = 'resi.clients'
export const CLIENT_EXPORT_VERSION = 1

/**
 * Identité du propriétaire, embarquée avec chaque fiche.
 *
 * L'identifiant seul ne suffit pas : une base vidée puis repeuplée redonne de
 * nouveaux identifiants aux comptes, et c'est par l'e-mail ou le téléphone que
 * l'import retrouve le propriétaire recréé.
 */
export interface ExportedOwner {
  id: string
  full_name?: string | null
  email?: string | null
  phone?: string | null
}

export interface ExportedClient {
  id: string
  owner: ExportedOwner
  full_name: string
  phone: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
  /**
   * Références Cloudinary, exportées telles quelles : les pièces restent chez
   * l'hébergeur quand la base est vidée, et la fiche réimportée les retrouve.
   */
  id_document_front_public_id?: string | null
  id_document_back_public_id?: string | null
  birth_date?: Date | null
  birth_place?: string | null
  nationality?: string | null
  address?: string | null
  id_document_issued_at?: Date | null
  status?: ClientStatus
  created_by?: string | null
  created_at?: Date
  updated_at?: Date
}

export interface ClientExport {
  format: typeof CLIENT_EXPORT_FORMAT
  version: typeof CLIENT_EXPORT_VERSION
  exported_at: Date
  count: number
  clients: ExportedClient[]
}

/**
 * Les statistiques ne sont pas exportées : elles se dérivent des
 * réservations, qui ne survivent pas à la base vidée. Réimportées, elles
 * annonceraient des séjours introuvables.
 */
export function toExportedClient(record: ClientRecord, owner: ExportedOwner): ExportedClient {
  return {
    id: record._id,
    owner,
    full_name: record.full_name,
    phone: record.phone,
    whatsapp: record.whatsapp ?? null,
    id_document_type: record.id_document_type ?? null,
    id_document_number: record.id_document_number ?? null,
    id_document_front_public_id: record.id_document_front_public_id ?? null,
    id_document_back_public_id: record.id_document_back_public_id ?? null,
    // Absents des fiches antérieures au registre de police.
    birth_date: record.birth_date ?? null,
    birth_place: record.birth_place ?? null,
    nationality: record.nationality ?? null,
    address: record.address ?? null,
    id_document_issued_at: record.id_document_issued_at ?? null,
    status: record.status ?? 'active',
    // Absent des fiches antérieures au rôle gérant : saisie du propriétaire.
    created_by: record.created_by ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  }
}

export function buildClientExport(
  records: ClientRecord[],
  owners: Map<string, ExportedOwner>,
  now: Date
): ClientExport {
  return {
    format: CLIENT_EXPORT_FORMAT,
    version: CLIENT_EXPORT_VERSION,
    exported_at: now,
    count: records.length,
    clients: records.map((record) =>
      toExportedClient(
        record,
        // Propriétaire disparu : l'identifiant reste, l'import le signalera.
        owners.get(record.owner_id) ?? { id: record.owner_id }
      )
    ),
  }
}

export type ClientImportSkipReason = 'owner_not_found' | 'already_exists' | 'duplicate_phone'

const SKIP_MESSAGES: Record<ClientImportSkipReason, string> = {
  owner_not_found:
    'Propriétaire introuvable : aucun compte propriétaire ne porte cet e-mail ou ce téléphone.',
  already_exists: 'Fiche déjà présente dans la base.',
  duplicate_phone: 'Ce propriétaire a déjà un client avec ce numéro.',
}

export interface SkippedClient {
  /** Rang dans le fichier, à partir de 1. */
  line: number
  id: string
  full_name: string
  phone: string
  reason: ClientImportSkipReason
  message: string
}

export interface ClientImportReport {
  total: number
  created: number
  skipped: SkippedClient[]
}

export interface ClientImportContext {
  /** Propriétaire actuel de chaque `owner.id` du fichier ; absent s'il est introuvable. */
  owners: Map<string, string>
  /** Identifiants de fiches déjà présents en base. */
  existingIds: Set<string>
  /** Paires `owner_id:téléphone` déjà présentes en base. */
  existingPhones: Set<string>
  /** Comptes encore existants, pour `created_by`. */
  knownUserIds: Set<string>
}

export interface ClientImportPlan {
  records: ClientRecord[]
  skipped: SkippedClient[]
}

function phoneKey(ownerId: string, phone: string) {
  return `${ownerId}:${normalizePhone(phone)}`
}

/**
 * Décide, fiche par fiche, ce que l'import écrit.
 *
 * Rejouable : une fiche déjà importée garde son identifiant et se reconnaît au
 * second passage. Le contrôle sur le téléphone tient l'unicité de
 * `(owner_id, phone)` que Firestore ne garantit pas — y compris entre deux
 * lignes du même fichier.
 */
export function planClientImport(
  entries: ExportedClient[],
  context: ClientImportContext,
  now: Date
): ClientImportPlan {
  const records: ClientRecord[] = []
  const skipped: SkippedClient[] = []
  const takenIds = new Set(context.existingIds)
  const takenPhones = new Set(context.existingPhones)

  entries.forEach((entry, index) => {
    const skip = (reason: ClientImportSkipReason) =>
      skipped.push({
        line: index + 1,
        id: entry.id,
        full_name: entry.full_name,
        phone: entry.phone,
        reason,
        message: SKIP_MESSAGES[reason],
      })

    const ownerId = context.owners.get(entry.owner.id)
    if (!ownerId) return skip('owner_not_found')
    if (takenIds.has(entry.id)) return skip('already_exists')

    const key = phoneKey(ownerId, entry.phone)
    if (takenPhones.has(key)) return skip('duplicate_phone')

    // Un gérant recréé a un nouvel identifiant, impossible à retrouver : la
    // fiche passe au compte du propriétaire plutôt que de pointer dans le vide.
    const createdBy =
      entry.created_by && context.knownUserIds.has(entry.created_by) ? entry.created_by : null

    const payload = buildClientPayload(
      {
        owner_id: ownerId,
        full_name: entry.full_name,
        phone: entry.phone,
        whatsapp: entry.whatsapp ?? null,
        id_document_type: entry.id_document_type ?? null,
        id_document_number: entry.id_document_number ?? null,
        id_document_front_public_id: entry.id_document_front_public_id ?? null,
        id_document_back_public_id: entry.id_document_back_public_id ?? null,
        birth_date: entry.birth_date ?? null,
        birth_place: entry.birth_place ?? null,
        nationality: entry.nationality ?? null,
        address: entry.address ?? null,
        id_document_issued_at: entry.id_document_issued_at ?? null,
        created_by: createdBy,
      },
      now
    )

    records.push({
      ...payload,
      // Dates d'origine conservées : le carnet est trié sur `updated_at`, et
      // une reprise ne doit pas le réordonner.
      created_at: entry.created_at ?? now,
      updated_at: entry.updated_at ?? entry.created_at ?? now,
      status: entry.status ?? 'active',
      _id: entry.id,
    })
    takenIds.add(entry.id)
    takenPhones.add(key)
  })

  return { records, skipped }
}
