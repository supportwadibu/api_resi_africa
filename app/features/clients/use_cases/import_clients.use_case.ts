import { DomainError } from '#utils/domain_error'
import { clientExportContentValidator } from '#validators/client/client_transfer'

import {
  CLIENT_EXPORT_FORMAT,
  CLIENT_EXPORT_VERSION,
  planClientImport,
  type ClientImportReport,
  type ExportedClient,
} from '../client_transfer.ts'
import { ClientTransferRepository } from '../repositories/client_transfer_repository.ts'

/**
 * Réimporte un fichier produit par `ExportClientsUseCase`.
 *
 * Chaque fiche rejoint le carnet de son propriétaire, retrouvé par
 * identifiant, e-mail ou téléphone. Une fiche qui ne peut pas être reprise est
 * ignorée et listée dans le rapport, sans faire échouer les autres : le
 * propriétaire manquant se recrée, et l'import se relance sans doublon.
 */
export default class ImportClientsUseCase {
  constructor(private readonly repo = new ClientTransferRepository()) {}

  async execute(content: string): Promise<ClientImportReport> {
    const entries = await this.parse(content)

    const exportedOwners = [...new Map(entries.map((e) => [e.owner.id, e.owner])).values()]
    const owners = await this.repo.resolveOwners(exportedOwners)

    const [existingIds, existingPhones, knownUserIds] = await Promise.all([
      this.repo.findExistingIds(entries.map((e) => e.id)),
      this.repo.findPhoneKeys([...new Set(owners.values())]),
      this.repo.findKnownUserIds(entries.map((e) => e.created_by)),
    ])

    const plan = planClientImport(
      entries,
      { owners, existingIds, existingPhones, knownUserIds },
      new Date()
    )

    await this.repo.insertMany(plan.records)

    return { total: entries.length, created: plan.records.length, skipped: plan.skipped }
  }

  private async parse(content: string): Promise<ExportedClient[]> {
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch {
      throw new DomainError('invalid_import_file', 'Le fichier n’est pas un JSON valide.', 422)
    }

    const header = (raw ?? {}) as { format?: unknown; version?: unknown }
    if (header.format !== CLIENT_EXPORT_FORMAT) {
      throw new DomainError(
        'invalid_import_file',
        'Ce fichier n’est pas un export de clients RESI.',
        422
      )
    }
    if (header.version !== CLIENT_EXPORT_VERSION) {
      throw new DomainError(
        'unsupported_import_version',
        `Version d’export non prise en charge (${String(header.version)}).`,
        422
      )
    }

    const { clients } = await clientExportContentValidator.validate(raw)

    // VineJS rend des `DateTime` Luxon (`start/validator.ts`) ; le modèle
    // manipule des `Date`.
    return clients.map((client) => ({
      ...client,
      birth_date: toDate(client.birth_date),
      id_document_issued_at: toDate(client.id_document_issued_at),
      created_at: toDate(client.created_at) ?? undefined,
      updated_at: toDate(client.updated_at) ?? undefined,
    }))
  }
}

function toDate(value: { toJSDate(): Date } | null | undefined): Date | null {
  return value ? value.toJSDate() : null
}
