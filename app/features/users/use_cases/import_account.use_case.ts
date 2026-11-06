import { COLLECTIONS } from '#firebase/firestore'
import { normalizePhone } from '#models/client'
import { DomainError } from '#utils/domain_error'
import { accountExportContentValidator } from '#validators/user/account_transfer'

import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  ACCOUNT_SECTIONS,
  planStepImport,
  type AccountImportReport,
  type AccountImportSectionReport,
  type ExportedDocument,
} from '../account_transfer.ts'
import { AccountTransferRepository } from '../repositories/account_transfer_repository.ts'

import type { PurgeStep } from '../purge_plan.ts'

interface ParsedExport {
  account: { id: string; data: Record<string, unknown> }
  steps: Record<string, ExportedDocument[]>
}

/**
 * Réimporte un compte exporté par `ExportAccountUseCase`.
 *
 * Le compte déjà présent — même identifiant, e-mail ou téléphone — est gardé
 * tel quel ; seules les données absentes s'y ajoutent. Sinon il est recréé
 * sous son identifiant d'origine, mot de passe chiffré compris.
 */
export default class ImportAccountUseCase {
  constructor(private readonly repo = new AccountTransferRepository()) {}

  async execute(content: string): Promise<AccountImportReport> {
    const file = await this.parse(content)
    const { account } = file
    const roleId = String(account.data.role_id ?? '')

    const found = await this.repo.findAccount({
      id: account.id,
      email: text(account.data.email)?.toLowerCase() ?? null,
      phone: text(account.data.phone),
    })

    if (found && found.role_id !== roleId) {
      // Rattacher des logements à un compte client — ou l'inverse — qui
      // porterait le même numéro les livrerait à un tiers.
      throw new DomainError(
        'account_role_mismatch',
        'Un compte d’un autre rôle porte déjà cet e-mail ou ce téléphone.',
        409
      )
    }

    if (!found) {
      if (!(await this.repo.roleExists(roleId))) {
        throw new DomainError(
          'role_not_found',
          'Le rôle du compte n’existe pas dans la base : lancez `node ace seed:roles`.',
          422
        )
      }
      await this.repo.createAccount(account.id, account.data)
    }

    const targetId = found?.id ?? account.id
    const sections: AccountImportSectionReport[] = []

    // Dans l'ordre du plan et non du fichier : le catalogue précède les
    // réservations qui y renvoient.
    for (const section of ACCOUNT_SECTIONS) {
      const report: AccountImportSectionReport = {
        key: section.key,
        label: section.label,
        created: 0,
        existing: 0,
        rejected: 0,
      }
      let present = false

      for (const step of section.steps) {
        const docs = file.steps[step.key]
        if (!docs) continue
        present = true

        const plan = planStepImport(step, docs, {
          fromId: account.id,
          toId: targetId,
          existingIds: await this.repo.findExistingIds(
            step.collection,
            docs.map((d) => (step.kind === 'doc' ? targetId : d.id))
          ),
          accept: await this.acceptFor(step, targetId, docs),
        })

        await this.repo.insertDocuments(step.collection, plan.documents)
        report.created += plan.documents.length
        report.existing += plan.existing
        report.rejected += plan.rejected
      }

      if (present) sections.push(report)
    }

    return {
      account: {
        id: targetId,
        full_name: text(account.data.full_name),
        status: found ? 'existing' : 'created',
        matched_by: found?.matched_by ?? null,
      },
      sections,
    }
  }

  /** Contrôles propres à une étape, au-delà de l'identifiant. */
  private async acceptFor(
    step: PurgeStep,
    ownerId: string,
    docs: readonly ExportedDocument[]
  ): Promise<((doc: ExportedDocument) => boolean) | undefined> {
    if (step.collection === COLLECTIONS.clients) {
      // Unicité de `(owner_id, phone)` que Firestore ne garantit pas : le
      // carnet a pu être ressaisi entre l'export et l'import.
      const phones = await this.repo.findClientPhones(ownerId)
      return (doc) => {
        const phone = normalizePhone(String(doc.data.phone ?? ''))
        if (phones.has(phone)) return false
        phones.add(phone)
        return true
      }
    }

    if (step.key === 'client_bookings') {
      // Réservation chez un autre propriétaire : sans son logement, elle ne
      // serait rattachée à rien.
      const properties = await this.repo.findExistingIds(
        COLLECTIONS.properties,
        docs.map((d) => text(d.data.property_id))
      )
      return (doc) => properties.has(String(doc.data.property_id ?? ''))
    }

    return undefined
  }

  private async parse(content: string): Promise<ParsedExport> {
    let raw: unknown
    try {
      raw = JSON.parse(content)
    } catch {
      throw new DomainError('invalid_import_file', 'Le fichier n’est pas un JSON valide.', 422)
    }

    const header = (raw ?? {}) as { format?: unknown; version?: unknown }
    if (header.format !== ACCOUNT_EXPORT_FORMAT) {
      throw new DomainError(
        'invalid_import_file',
        'Ce fichier n’est pas un export de compte RESI.',
        422
      )
    }
    if (header.version !== ACCOUNT_EXPORT_VERSION) {
      throw new DomainError(
        'unsupported_import_version',
        `Version d’export non prise en charge (${String(header.version)}).`,
        422
      )
    }

    return (await accountExportContentValidator.validate(raw)) as ParsedExport
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}
