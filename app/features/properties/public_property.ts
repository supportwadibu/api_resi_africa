import type { PropertyDto } from './dto/property.dto.ts'

/**
 * Une résidence se montre-t-elle sans compte ?
 *
 * Règle unique pour la liste, la fiche et la disponibilité. Un bien sans
 * `visibility` (historique) est privé : la liste publique, qui filtre sur
 * `is_public == true`, ne l'a jamais montré.
 */
export function isPublicProperty(property: {
  status: string
  visibility?: { is_public?: boolean }
}): boolean {
  return property.status === 'published' && property.visibility?.is_public === true
}

/** Adresse publique : la ville et une position approximative, rien de plus. */
export interface PublicAddress {
  street: string
  city: string
  country: string | undefined
  postal_code: null
  coordinates: { latitude: number | null; longitude: number | null }
}

/** Résidence telle que la voit un visiteur de l'app client. */
export type PublicPropertyDto = Pick<
  PropertyDto,
  | 'id'
  | 'residence_id'
  | 'unit_label'
  | 'title'
  | 'description'
  | 'property_type'
  | 'status'
  | 'details'
  | 'amenities'
  | 'media'
  | 'pricing'
  | 'charges_included'
  | 'additional_charges'
  | 'available_from'
  | 'visibility'
  | 'created_at'
  | 'updated_at'
> & { address: PublicAddress }

/** Trois décimales : environ 110 m à l'équateur. */
const COORDINATE_PRECISION = 1000

function roundCoordinate(value: number | null | undefined): number | null {
  return typeof value === 'number'
    ? Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION
    : null
}

/**
 * Vue publique d'une résidence, servie sans compte.
 *
 * Règle anti-contournement : rien ne doit permettre de joindre le propriétaire
 * ou de se rendre sur place sans passer par une réservation. L'identifiant du
 * propriétaire, l'occupant en cours et les compteurs sont retirés ; l'adresse
 * est réduite à la ville et la position arrondie à une centaine de mètres —
 * assez pour situer le quartier sur la carte, pas pour trouver la porte.
 *
 * Liste blanche plutôt que noire : un champ ajouté plus tard au DTO ne sort
 * pas sur la route publique sans avoir été choisi ici.
 */
export function toPublicProperty(property: PropertyDto): PublicPropertyDto {
  // Biens historiques sans adresse complète : les champs absents restent vides
  // plutôt que de lever.
  const address: Partial<PropertyDto['address']> = property.address ?? {}
  return {
    id: property.id,
    residence_id: property.residence_id,
    unit_label: property.unit_label,
    title: property.title,
    description: property.description,
    property_type: property.property_type,
    status: property.status,
    details: property.details,
    amenities: property.amenities,
    media: property.media,
    pricing: property.pricing,
    charges_included: property.charges_included,
    additional_charges: property.additional_charges,
    available_from: property.available_from,
    visibility: property.visibility,
    created_at: property.created_at,
    updated_at: property.updated_at,
    address: {
      street: '',
      city: address.city ?? '',
      country: address.country,
      postal_code: null,
      coordinates: {
        latitude: roundCoordinate(address.coordinates?.latitude),
        longitude: roundCoordinate(address.coordinates?.longitude),
      },
    },
  }
}
