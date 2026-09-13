/**
 * DTO d'entrée/sortie pour les usecases Residence.
 * Format primitivisé, directement sérialisable JSON.
 */

export interface ResidenceAddressInput {
  street: string
  city: string
  country?: string
  postal_code?: string
  coordinates?: {
    latitude?: number
    longitude?: number
  }
}

export interface ResidenceAmenitiesInput {
  pool?: boolean
  gym?: boolean
  security?: boolean
  concierge?: boolean
  elevator?: boolean
  parking?: boolean
  garden?: boolean
  wifi?: boolean
}

export interface ResidenceMediaInput {
  images?: string[]
  videos?: string[]
}

export interface ResidenceDto {
  id: string
  owner_id: string
  name: string
  description: string
  address: {
    street: string
    city: string
    country: string
    postal_code: string | null
    coordinates: { latitude: number | null; longitude: number | null }
  }
  media: { images: string[]; videos: string[] }
  amenities: {
    pool: boolean
    gym: boolean
    security: boolean
    concierge: boolean
    elevator: boolean
    parking: boolean
    garden: boolean
    wifi: boolean
  }
  /** Nombre d'unités rattachées, dénormalisé sur la résidence. */
  units_count: number
  created_at: Date
  updated_at: Date
}

export interface CreateResidenceInput {
  owner_id: string
  name: string
  description: string
  address: ResidenceAddressInput
  media?: ResidenceMediaInput
  amenities?: ResidenceAmenitiesInput
}

export interface UpdateResidenceInput {
  name?: string
  description?: string
  address?: ResidenceAddressInput
  media?: ResidenceMediaInput
  amenities?: ResidenceAmenitiesInput
}

export interface ListResidencesInput {
  page?: number
  per_page?: number
}

export interface ListResidencesOutput {
  data: ResidenceDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
