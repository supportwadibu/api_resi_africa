import { COLLECTIONS, collection, toPayload, type WithId } from '#firebase/firestore'

import type { ReportType } from '#features/reports/dto/report.dto'

/**
 * Trace d'une édition de rapport PDF.
 *
 * Écrite après un rendu réussi, à des fins d'observation — volume de rapports
 * édités, taille moyenne, répartition par type — jamais lue pour reconstituer
 * ou re-livrer un document : depuis que le PDF n'est plus stocké (401
 * Cloudinary sur l'offre gratuite, voir la conception des rapports), ce
 * document ne porte plus le fichier, seulement ses métadonnées.
 */

export interface ReportGenerationDocument {
  owner_id: string
  type: ReportType
  /** `null` : rapport portant sur l'ensemble du parc, pas une résidence précise. */
  residence_id: string | null
  period_from: Date
  period_to: Date
  /** Octets du PDF produit, pour suivre le poids moyen d'un rapport. */
  file_size: number
  created_at: Date
}

export type ReportGenerationRecord = WithId<ReportGenerationDocument>

function reportGenerations() {
  return collection<ReportGenerationDocument>(COLLECTIONS.reportGenerations)
}

const ReportGeneration = {
  async create(input: ReportGenerationDocument): Promise<ReportGenerationRecord> {
    const docRef = await reportGenerations().add(
      toPayload(input) as unknown as ReportGenerationDocument
    )
    return { ...input, _id: docRef.id }
  },
}

export default ReportGeneration
