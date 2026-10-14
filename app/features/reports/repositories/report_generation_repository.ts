import ReportGeneration, { type ReportGenerationDocument } from '#models/report_generation'

import type { ReportType } from '#features/reports/dto/report.dto'

export interface RecordReportGenerationInput {
  owner_id: string
  type: ReportType
  residence_id: string | null
  period_from: Date
  period_to: Date
  file_size: number
}

/**
 * Assemble le document de trace, séparément de l'écriture Firestore : c'est
 * la seule partie de `record` qui n'a besoin d'aucun service externe, et donc
 * la seule testable en `tests/unit/`.
 */
export function buildReportGenerationDocument(
  input: RecordReportGenerationInput,
  now: Date = new Date()
): ReportGenerationDocument {
  return { ...input, created_at: now }
}

export class ReportGenerationRepository {
  async record(input: RecordReportGenerationInput): Promise<void> {
    await ReportGeneration.create(buildReportGenerationDocument(input))
  }
}

export default ReportGenerationRepository
