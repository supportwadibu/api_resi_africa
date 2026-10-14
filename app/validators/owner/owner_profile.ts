import { ID_DOCUMENT_TYPES } from '#utils/enums/id_document_type'
import vine from '@vinejs/vine'

/** Taille maximale d'un justificatif. Large pour une photo, court pour un abus. */
const MAX_DOCUMENT_SIZE = '5mb'

/** Formats acceptés — cohérents avec `ACCEPTED_DOCUMENT_MIME_TYPES` côté stockage. */
const ACCEPTED_DOCUMENT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

/**
 * POST /proprio/profile — dépôt du dossier de validation.
 *
 * Les deux faces de la pièce sont déclarées optionnelles ici, pour deux raisons
 * que le schéma ne sait pas exprimer :
 *
 *  - le verso n'a de sens que pour certains types de pièce (pas un passeport) ;
 *  - une mise à jour peut ne réenvoyer que les champs texte, les fichiers déjà
 *    déposés restant valables.
 *
 * La règle « le dossier est-il complet ? » est donc portée par le use case, qui
 * connaît l'état déjà enregistré.
 */
export const submitOwnerProfileValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(150),
    phone: vine.string().trim().minLength(6).maxLength(30),

    address: vine.string().trim().maxLength(255).optional(),
    city: vine.string().trim().maxLength(120).optional(),
    country: vine.string().trim().maxLength(120).optional(),

    id_document_type: vine.enum(ID_DOCUMENT_TYPES),
    id_document_number: vine.string().trim().minLength(3).maxLength(60),

    id_document_front: vine
      .file({ size: MAX_DOCUMENT_SIZE, extnames: ACCEPTED_DOCUMENT_EXTENSIONS })
      .optional(),
    id_document_back: vine
      .file({ size: MAX_DOCUMENT_SIZE, extnames: ACCEPTED_DOCUMENT_EXTENSIONS })
      .optional(),
  })
)
