import { CLIENT_STATUSES, ID_DOCUMENT_TYPES } from '#models/client'
import vine from '@vinejs/vine'

/** Formats acceptés pour une pièce, alignés sur `document_storage`. */
const documentFile = vine.file({
  size: '5mb',
  extnames: ['jpg', 'jpeg', 'png', 'webp'],
})

/**
 * Date calendaire d'une pièce — naissance, délivrance. Le corps est un
 * `multipart/form-data` : la date arrive en texte, sans heure, et une heure
 * ajoutée par l'appareil la décalerait d'un jour selon le fuseau.
 */
const calendarDate = () => vine.date({ formats: ['YYYY-MM-DD'] })

export const createClientValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120),
    phone: vine.string().trim().minLength(8).maxLength(20),
    whatsapp: vine.string().trim().minLength(8).maxLength(20).optional(),
    id_document_type: vine.enum(ID_DOCUMENT_TYPES).optional(),
    id_document_number: vine.string().trim().maxLength(50).optional(),
    birth_date: calendarDate().optional(),
    birth_place: vine.string().trim().maxLength(120).optional(),
    nationality: vine.string().trim().maxLength(60).optional(),
    address: vine.string().trim().maxLength(200).optional(),
    id_document_issued_at: calendarDate().optional(),
    id_document_front: documentFile.clone().optional(),
    id_document_back: documentFile.clone().optional(),
  })
)

/**
 * Une chaîne vide vaut `null` (`convertEmptyStringsToNull`) : c'est ainsi
 * qu'un formulaire multipart efface un champ, faute de pouvoir envoyer `null`.
 */
export const updateClientValidator = vine.compile(
  vine.object({
    full_name: vine.string().trim().minLength(2).maxLength(120).optional(),
    phone: vine.string().trim().minLength(8).maxLength(20).optional(),
    whatsapp: vine.string().trim().minLength(8).maxLength(20).nullable().optional(),
    id_document_type: vine.enum(ID_DOCUMENT_TYPES).nullable().optional(),
    id_document_number: vine.string().trim().maxLength(50).nullable().optional(),
    birth_date: calendarDate().nullable().optional(),
    birth_place: vine.string().trim().maxLength(120).nullable().optional(),
    nationality: vine.string().trim().maxLength(60).nullable().optional(),
    address: vine.string().trim().maxLength(200).nullable().optional(),
    id_document_issued_at: calendarDate().nullable().optional(),
    status: vine.enum(CLIENT_STATUSES).optional(),
    id_document_front: documentFile.clone().optional(),
    id_document_back: documentFile.clone().optional(),
  })
)

export const listClientsValidator = vine.compile(
  vine.object({
    q: vine.string().trim().maxLength(100).optional(),
    status: vine.enum(CLIENT_STATUSES).optional(),
    page: vine.number().min(1).withoutDecimals().optional(),
    per_page: vine.number().min(1).max(100).withoutDecimals().optional(),
  })
)

export const lookupClientValidator = vine.compile(
  vine.object({
    phone: vine.string().trim().minLength(8).maxLength(20),
  })
)
