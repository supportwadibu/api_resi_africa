/* eslint-disable prettier/prettier */
/**
 * DTO d'entrée/sortie pour les usecases Property.
 * Format primitivisé, directement sérialisable JSON.
 */

export type PropertyStatus =
  | 'draft'
  | 'published'
  | 'reserved'
  | 'rented'
  | 'maintenance'
  | 'inactive'

export type PropertyType = 'apartment' | 'studio' | 'villa' | 'duplex'

export type Furnishing = 'unfurnished' | 'semi_furnished' | 'furnished'

export interface AddressInput {
  street: string
  city: string
  country?: string
  postal_code?: string
  coordinates?: {
    latitude?: number
    longitude?: number
  }
}

export interface PropertyDetailsInput {
  surface_area?: number
  bedrooms: number
  bathrooms: number
  living_rooms: number
  kitchens: number
  parking_spaces: number
  floor_number?: number
  total_floors?: number
  year_built?: number
  furnishing?: Furnishing
}

export interface AmenitiesInput {
  air_conditioning?: boolean
  heating?: boolean
  elevator?: boolean
  balcony?: boolean
  terrace?: boolean
  garden?: boolean
  pool?: boolean
  gym?: boolean
  security?: boolean
  concierge?: boolean
  wifi?: boolean
  parking?: boolean
  pet_friendly?: boolean
  smoking_allowed?: boolean
}

export interface MediaInput {
  images?: string[]
  videos?: string[]
  virtual_tour?: string
  floor_plan?: string
}

export interface PropertyDto {
  id: string
  owner_id: string
  /** Résidence de l'unité, `null` pour un bien autonome. */
  residence_id: string | null
  /** Nom de l'unité dans sa résidence — « Studio 1 ». */
  unit_label: string | null
  title: string
  description: string
  property_type: PropertyType
  status: PropertyStatus
  address: AddressInput
  details: PropertyDetailsInput
  amenities: AmenitiesInput
  media: MediaInput
  pricing: PropertyPricingInput
  charges_included: boolean
  additional_charges: number
  available_from: Date
  visibility: {
    is_public: boolean
    featured: boolean
    published_at: Date | null
  }
  rental_info: {
    current_tenant_id: string | null
    last_rent_payment_date: Date | null
  }
  metadata: {
    views_count: number
    contact_requests_count: number
    last_viewed_at: Date | null
  }
  created_at: Date
  updated_at: Date
}

export interface CreatePropertyInput {
  owner_id: string
  /**
   * Résidence d'accueil. Renseignée, l'adresse en est copiée et devient
   * facultative dans l'entrée.
   */
  residence_id?: string | null
  unit_label?: string | null
  title: string
  description: string
  property_type: PropertyType
  /** Facultative pour une unité rattachée : copiée depuis la résidence. */
  address?: AddressInput
  details: PropertyDetailsInput
  amenities?: AmenitiesInput
  media?: MediaInput
  pricing: PropertyPricingInput
  charges_included?: boolean
  additional_charges?: number
  available_from: Date
}

export interface UpdatePropertyInput {
  /**
   * `residence_id` est absent volontairement : le rattachement passe par une
   * route dédiée, qui copie l'adresse et ajuste les compteurs des deux
   * résidences concernées.
   */
  unit_label?: string | null
  title?: string
  description?: string
  property_type?: PropertyType
  status?: PropertyStatus
  address?: Partial<AddressInput>
  details?: Partial<PropertyDetailsInput>
  amenities?: AmenitiesInput
  media?: MediaInput
  pricing?: Partial<PropertyPricingInput>
  charges_included?: boolean
  additional_charges?: number
  available_from?: Date
  visibility?: {
    is_public?: boolean
    featured?: boolean
    published_at?: Date
  }
  rental_info?: {
    current_tenant_id?: string | null
    last_rent_payment_date?: Date
  }
}

export interface ListPropertiesFilters {
  owner_id?: string
  status?: PropertyStatus
  property_type?: PropertyType
  city?: string
  min_price?: number
  max_price?: number
  min_surface?: number
  max_surface?: number
  min_bedrooms?: number
  furnished?: Furnishing
  featured?: boolean
  available_from?: Date
  is_public?: boolean
  page?: number
  per_page?: number
  sort?: string
}

export interface ListPropertiesOutput {
  data: PropertyDto[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface PropertyStatsDto {
  total: number
  published: number
  rented: number
  draft: number
  total_views: number
}

export interface PropertyPriceTierInput {
  min_days: number
  discount_percent: number
}

export interface PropertyPricingInput {
  daily_price: number
  /** Paliers de remise par durée. Remplaçables intégralement à tout moment. */
  price_tiers?: PropertyPriceTierInput[] | null
  minimum_stay_days?: number
  maximum_stay_days?: number | null
}