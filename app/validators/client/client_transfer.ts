import { CLIENT_STATUSES, ID_DOCUMENT_TYPES } from '#models/client'
import vine from '@vinejs/vine'

/**
 * Fichier produit par l'export. 10 Mo couvrent des dizaines de milliers de
 * fiches ; le plafond du multipart reste celui de `config/bodyparser.ts`.
 */
export const importClientsValidator = vine.compile(
  vine.object({
    file: vine.file({ size: '10mb', extnames: ['json'] }),
  })
)

/** Les dates sortent de l'export en ISO 8601 complet, heure comprise. */
const isoDate = () => vine.date({ formats: ['iso8601'] })

const nullableText = (max: number) => vine.string().trim().maxLength(max).nullable().optional()

/**
 * Contenu du fichier, une fois lu. Les champs inconnus sont écartés : un
 * fichier retouché à la main ne peut rien glisser d'autre dans la fiche.
 */
export const clientExportContentValidator = vine.compile(
  vine.object({
    clients: vine
      .array(
        vine.object({
          // Devient l'identifiant du document : une barre oblique en ferait
          // un chemin vers une sous-collection.
          id: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(128)
            .regex(/^[^/]+$/),
          owner: vine.object({
            id: vine.string().trim().minLength(1).maxLength(128),
            full_name: nullableText(120),
            email: nullableText(254),
            phone: nullableText(30),
          }),
          full_name: vine.string().trim().minLength(1).maxLength(120),
          phone: vine.string().trim().minLength(1).maxLength(30),
          whatsapp: nullableText(30),
          id_document_type: vine.enum(ID_DOCUMENT_TYPES).nullable().optional(),
          id_document_number: nullableText(50),
          id_document_front_public_id: nullableText(300),
          id_document_back_public_id: nullableText(300),
          birth_date: isoDate().nullable().optional(),
          birth_place: nullableText(120),
          nationality: nullableText(60),
          address: nullableText(200),
          id_document_issued_at: isoDate().nullable().optional(),
          status: vine.enum(CLIENT_STATUSES).optional(),
          created_by: nullableText(128),
          created_at: isoDate().optional(),
          updated_at: isoDate().optional(),
        })
      )
      .maxLength(50000),
  })
)
