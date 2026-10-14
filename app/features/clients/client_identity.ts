import type { DateTime } from 'luxon'

/** Champs d'identité tels que VineJS les rend. */
interface IdentityPayload {
  birth_date?: DateTime | null
  birth_place?: string | null
  nationality?: string | null
  address?: string | null
  id_document_issued_at?: DateTime | null
}

/** Champs d'identité tels que les use cases les attendent. */
export interface ClientIdentityInput {
  birth_date?: Date | null
  birth_place?: string | null
  nationality?: string | null
  address?: string | null
  id_document_issued_at?: Date | null
}

/**
 * Traduit les champs d'identité validés pour les use cases.
 *
 * Trois états à préserver, et c'est tout l'objet de la fonction : absent
 * (`undefined`, champ non envoyé — la fiche garde sa valeur), effacé (`null`)
 * et renseigné. Une conversion naïve `payload.birth_date?.toJSDate()` rendrait
 * `undefined` pour `null`, et un effacement demandé serait ignoré.
 *
 * Partagée par la création et la mise à jour, côté propriétaire comme côté
 * gérant : quatre recopies divergeraient au premier champ ajouté.
 */
export function readClientIdentity(payload: IdentityPayload): ClientIdentityInput {
  return {
    birth_date: toDate(payload.birth_date),
    birth_place: payload.birth_place,
    nationality: payload.nationality,
    address: payload.address,
    id_document_issued_at: toDate(payload.id_document_issued_at),
  }
}

function toDate(value: DateTime | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return value.toJSDate()
}
