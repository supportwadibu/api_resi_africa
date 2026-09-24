import { SCOPE_READ_LIMIT } from '#features/managers/scope'
import { COLLECTIONS, getByIds } from '#firebase/firestore'
import Property, { type PropertyDocument, type PropertyRecord } from '#models/property'

import type {
  CreatePropertyInput,
  ListPropertiesFilters,
  PropertyDto,
  PropertyStatsDto,
  UpdatePropertyInput,
} from '../dto/property.dto.ts'

export class PropertyRepository {
  static toDto(doc: PropertyRecord): PropertyDto {
    return {
      id: doc._id,
      owner_id: doc.owner_id,
      // Absents des biens antérieurs aux résidences : `null` signifie
      // « bien autonome », le comportement d'origine.
      residence_id: doc.residence_id ?? null,
      unit_label: doc.unit_label ?? null,
      title: doc.title,
      description: doc.description,
      property_type: doc.property_type,
      status: doc.status,
      address: doc.address,
      details: doc.details,
      amenities: doc.amenities ?? {},
      media: doc.media ?? {},
      pricing: {
        daily_price: doc.pricing?.daily_price ?? 0,
        // Grille vide pour les biens antérieurs aux paliers : le tarif plein
        // s'applique alors quelle que soit la durée.
        price_tiers: doc.pricing?.price_tiers ?? [],
        minimum_stay_days: doc.pricing?.minimum_stay_days ?? 1,
        maximum_stay_days: doc.pricing?.maximum_stay_days ?? null,
      },
      charges_included: doc.charges_included,
      additional_charges: doc.additional_charges,
      available_from: doc.available_from,
      visibility: {
        is_public: doc.visibility?.is_public ?? false,
        featured: doc.visibility?.featured ?? false,
        published_at: doc.visibility?.published_at ?? null,
      },
      rental_info: {
        current_tenant_id: doc.rental_info?.current_tenant_id ?? null,
        last_rent_payment_date: doc.rental_info?.last_rent_payment_date ?? null,
      },
      metadata: {
        views_count: doc.metadata?.views_count ?? 0,
        contact_requests_count: doc.metadata?.contact_requests_count ?? 0,
        last_viewed_at: doc.metadata?.last_viewed_at ?? null,
      },
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    } as PropertyDto
  }

  async create(input: CreatePropertyInput): Promise<PropertyDto> {
    const doc = await Property.create(input as never)
    return PropertyRepository.toDto(doc)
  }

  async findById(id: string): Promise<PropertyDto | null> {
    const doc = await Property.findById(id)
    return doc ? PropertyRepository.toDto(doc) : null
  }

  async findByIdAndOwner(id: string, owner_id: string): Promise<PropertyDto | null> {
    const doc = await Property.findByIdAndOwner(id, owner_id)
    return doc ? PropertyRepository.toDto(doc) : null
  }

  async update(
    id: string,
    input: UpdatePropertyInput,
    owner_id?: string
  ): Promise<PropertyDto | null> {
    const doc = await Property.findByIdAndUpdate(id, { ...input }, owner_id)
    return doc ? PropertyRepository.toDto(doc) : null
  }

  async delete(id: string, owner_id?: string): Promise<boolean> {
    return Property.deleteOne(id, owner_id)
  }

  async incrementViews(id: string): Promise<void> {
    await Property.recordView(id)
  }

  async stats(owner_id: string): Promise<PropertyStatsDto> {
    return Property.statsByOwner(owner_id)
  }

  /** Logements cités par une liste, lus en lot et indexés par identifiant. */
  async findManyByIds(
    ids: readonly (string | null | undefined)[]
  ): Promise<Map<string, PropertyDto>> {
    const docs = await getByIds<PropertyDocument>(COLLECTIONS.properties, ids)

    const out = new Map<string, PropertyDto>()
    for (const [id, doc] of docs) out.set(id, PropertyRepository.toDto(doc))
    return out
  }

  /** Unités des résidences données, toutes pages confondues. */
  async listByResidenceIds(residenceIds: readonly string[]): Promise<PropertyDto[]> {
    const docs = await Property.findByResidenceIds(residenceIds)
    return docs.map((doc) => PropertyRepository.toDto(doc))
  }

  /**
   * Tous les logements répondant aux filtres, bornés, sans découpe en pages.
   *
   * Pendant de `ResidenceRepository.listAll`, et pour le même besoin : le
   * regroupement rendu à un gérant recompte les unités de chaque résidence, si
   * bien qu'une page partielle de logements donnerait des `units_count` faux
   * plutôt qu'une simple liste écourtée.
   *
   * Ne délègue pas à `paginate` : celle-ci rabat `per_page` à 100 pour protéger
   * une réponse paginée, et ce rabattement silencieux est exactement le défaut
   * qu'on corrige ici. La borne appliquée est `SCOPE_READ_LIMIT`, la même que
   * celle que l'appelant croit demander.
   */
  async listAllInScope(filters: ListPropertiesFilters): Promise<PropertyDto[]> {
    const { data } = await Property.paginate(
      {
        owner_id: filters.owner_id || undefined,
        residence_id: filters.residence_id || undefined,
        status: filters.status,
        scope_property_ids: filters.scope_property_ids,
      },
      { limit: SCOPE_READ_LIMIT, offset: 0 }
    )

    return data.map((d) => PropertyRepository.toDto(d))
  }

  async paginate(filters: ListPropertiesFilters): Promise<{
    data: PropertyDto[]
    total: number
    page: number
    perPage: number
  }> {
    const page = Math.max(1, filters.page ?? 1)
    const perPage = Math.min(100, Math.max(1, filters.per_page ?? 20))

    const { data, total } = await Property.paginate(
      {
        owner_id: filters.owner_id || undefined,
        residence_id: filters.residence_id || undefined,
        status: filters.status,
        property_type: filters.property_type,
        city: filters.city,
        furnishing: filters.furnished,
        featured: filters.featured,
        is_public: filters.is_public,
        min_price: filters.min_price,
        max_price: filters.max_price,
        min_surface: filters.min_surface,
        max_surface: filters.max_surface,
        min_bedrooms: filters.min_bedrooms,
        available_from: filters.available_from,
        // Le périmètre doit descendre jusqu'à la requête : omis ici, la liste
        // porterait sur tout le parc du propriétaire sans la moindre erreur de
        // compilation, les filtres étant recopiés champ par champ.
        scope_property_ids: filters.scope_property_ids,
      },
      { limit: perPage, offset: (page - 1) * perPage }
    )

    return {
      data: data.map((d) => PropertyRepository.toDto(d)),
      total,
      page,
      perPage,
    }
  }
}

export default PropertyRepository
