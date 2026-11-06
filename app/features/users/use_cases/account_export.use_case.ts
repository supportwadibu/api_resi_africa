import { DomainError } from '#utils/domain_error'

import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  ACCOUNT_SECTIONS,
  sectionsByKeys,
  type AccountExport,
  type ExportedDocument,
} from '../account_transfer.ts'
import { AccountTransferRepository } from '../repositories/account_transfer_repository.ts'

export interface AccountExportPreview {
  account: { id: string; role: string; full_name: string | null }
  sections: {
    key: string
    label: string
    /** Cochée d'office pour ce rôle. */
    default_selected: boolean
    /** Documents que la section emporterait. */
    count: number
  }[]
}

/**
 * Ce qu'un export emporterait, section par section : l'administrateur choisit
 * en voyant les volumes, et une section vide n'est pas proposée.
 */
export class PreviewAccountExportUseCase {
  constructor(private readonly repo = new AccountTransferRepository()) {}

  async execute(userId: string): Promise<AccountExportPreview> {
    const account = await this.repo.readAccount(userId)
    if (!account) throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)

    const sections = await Promise.all(
      ACCOUNT_SECTIONS.map(async (section) => {
        const counts = await Promise.all(
          section.steps.map((step) => this.repo.countStep(step, userId))
        )
        return {
          key: section.key,
          label: section.label,
          default_selected: section.roles.includes(account.role),
          count: counts.reduce((sum, n) => sum + n, 0),
        }
      })
    )

    return {
      account: { id: userId, role: account.role, full_name: textOrNull(account.data.full_name) },
      sections,
    }
  }
}

/** Exporte un compte et les sections choisies, en un fichier rejouable. */
export class ExportAccountUseCase {
  constructor(private readonly repo = new AccountTransferRepository()) {}

  async execute(userId: string, sectionKeys: readonly string[] = []): Promise<AccountExport> {
    const account = await this.repo.readAccount(userId)
    if (!account) throw new DomainError('user_not_found', 'Utilisateur introuvable.', 404)

    const sections = sectionsByKeys(sectionKeys)
    const steps: Record<string, ExportedDocument[]> = {}

    // En série : un compte chargé porte des milliers de réservations, et tout
    // lire d'un coup n'accélère rien sur une opération rare.
    for (const section of sections) {
      for (const step of section.steps) {
        steps[step.key] = await this.repo.readStep(step, userId)
      }
    }

    return {
      format: ACCOUNT_EXPORT_FORMAT,
      version: ACCOUNT_EXPORT_VERSION,
      exported_at: new Date(),
      account: {
        id: userId,
        role: account.role,
        full_name: textOrNull(account.data.full_name),
        email: textOrNull(account.data.email),
        phone: textOrNull(account.data.phone),
        data: account.data,
      },
      sections: sections.map((s) => s.key),
      steps,
    }
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
