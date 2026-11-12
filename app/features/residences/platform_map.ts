import type { UserSummaryDto } from '#features/users/dto/user.dto'
import type { PropertyStatus, PropertyType } from '#models/property'

/**
 * Lieux de la plateforme placés sur la carte du back-office.
 *
 * Deux sortes de points : une **résidence** (bâtiment regroupant des unités)
 * et un **logement autonome**, rattaché à aucune résidence. Une unité de
 * résidence n'a pas son propre point : elle partage l'adresse de son
 * bâtiment, et cent studios empilés au même endroit rendraient la carte
 * illisible. Elle se compte dans sa résidence.
 */
export interface MapPointDto {
  id: string
  kind: 'residence' | 'property'
  name: string
  street: string
  city: string
  latitude: number
  longitude: number
  owner: UserSummaryDto | null
  /** Unités de la résidence ; 1 pour un logement autonome. */
  units_count: number
  /** Unités publiées, donc réservables depuis l'application client. */
  published_count: number
  /** Plus petit tarif journalier des unités publiées, `null` sans unité publiée. */
  min_daily_price: number | null
  image: string | null
  /** Logement autonome seulement. */
  property_type: PropertyType | null
  status: PropertyStatus | null
}

export interface PlatformMapDto {
  data: MapPointDto[]
  /** Lieux écartés faute de coordonnées exploitables. */
  without_coordinates: number
  /** Vrai quand la borne de lecture a été atteinte : la carte est incomplète. */
  truncated: boolean
}

/** Ce que la carte lit d'une résidence. */
export interface MapResidenceSource {
  _id: string
  owner_id: string
  name?: string
  address?: {
    street?: string
    city?: string
    coordinates?: { latitude?: number | null; longitude?: number | null }
  }
  media?: { images?: string[] }
  units_count?: number
}

/** Ce que la carte lit d'un logement. */
export interface MapPropertySource {
  _id: string
  owner_id: string
  residence_id?: string | null
  title?: string
  property_type?: PropertyType
  status?: PropertyStatus
  address?: MapResidenceSource['address']
  media?: { images?: string[] }
  pricing?: { daily_price?: number }
}

/**
 * Coordonnées exploitables, ou `null`.
 *
 * `0, 0` est écarté avec le reste : c'est la valeur qu'écrivent les
 * formulaires restés vides, et elle placerait le lieu au large du Ghana.
 */
export function mapCoordinates(
  address: MapResidenceSource['address']
): { latitude: number; longitude: number } | null {
  const lat = address?.coordinates?.latitude
  const lng = address?.coordinates?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { latitude: lat, longitude: lng }
}

function minPrice(units: MapPropertySource[]): number | null {
  const prices = units
    .filter((u) => u.status === 'published')
    .map((u) => u.pricing?.daily_price)
    .filter((p): p is number => typeof p === 'number' && p > 0)
  return prices.length > 0 ? Math.min(...prices) : null
}

/** Points de la carte, à partir des documents lus et des propriétaires. */
export function buildMapPoints(
  residences: MapResidenceSource[],
  properties: MapPropertySource[],
  owners: Map<string, UserSummaryDto>
): Omit<PlatformMapDto, 'truncated'> {
  const unitsByResidence = new Map<string, MapPropertySource[]>()
  const standalone: MapPropertySource[] = []
  for (const property of properties) {
    // Champ absent des biens antérieurs aux résidences : autonomes.
    if (property.residence_id) {
      const list = unitsByResidence.get(property.residence_id) ?? []
      list.push(property)
      unitsByResidence.set(property.residence_id, list)
    } else {
      standalone.push(property)
    }
  }

  const data: MapPointDto[] = []
  let withoutCoordinates = 0

  for (const residence of residences) {
    const coords = mapCoordinates(residence.address)
    if (!coords) {
      withoutCoordinates += 1
      continue
    }
    const units = unitsByResidence.get(residence._id) ?? []
    data.push({
      id: residence._id,
      kind: 'residence',
      name: residence.name ?? '',
      street: residence.address?.street ?? '',
      city: residence.address?.city ?? '',
      ...coords,
      owner: owners.get(residence.owner_id) ?? null,
      // Le compteur dénormalisé fait foi ; les unités lues ne le remplacent
      // que s'il manque, sur une résidence écrite avant son introduction.
      units_count: residence.units_count ?? units.length,
      published_count: units.filter((u) => u.status === 'published').length,
      min_daily_price: minPrice(units),
      // Photo du bâtiment, à défaut celle d'une de ses unités.
      image:
        residence.media?.images?.[0] ??
        units.find((u) => u.media?.images?.[0])?.media?.images?.[0] ??
        null,
      property_type: null,
      status: null,
    })
  }

  for (const property of standalone) {
    const coords = mapCoordinates(property.address)
    if (!coords) {
      withoutCoordinates += 1
      continue
    }
    data.push({
      id: property._id,
      kind: 'property',
      name: property.title ?? '',
      street: property.address?.street ?? '',
      city: property.address?.city ?? '',
      ...coords,
      owner: owners.get(property.owner_id) ?? null,
      units_count: 1,
      published_count: property.status === 'published' ? 1 : 0,
      min_daily_price: minPrice([property]),
      image: property.media?.images?.[0] ?? null,
      property_type: property.property_type ?? null,
      status: property.status ?? null,
    })
  }

  return { data, without_coordinates: withoutCoordinates }
}
