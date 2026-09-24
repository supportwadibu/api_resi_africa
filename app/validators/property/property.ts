import vine from '@vinejs/vine'

const PROPERTY_TYPES = ['apartment', 'studio', 'villa', 'duplex'] as const

const PROPERTY_STATUSES = [
  'draft',
  'published',
  'reserved',
  'rented',
  'maintenance',
  'inactive',
] as const
const FURNISHING = ['unfurnished', 'semi_furnished', 'furnished'] as const

/**
 * Statuts qu'un propriétaire peut poser lui-même.
 *
 * `reserved` et `rented` en sont absents : ils décrivent une occupation, et
 * celle-ci est déduite des réservations. Un bien laissé en `reserved` restait
 * invendable indéfiniment, aucun flux ne le repassant en `published`.
 */
const OWNER_SETTABLE_STATUSES = ['draft', 'published', 'maintenance', 'inactive'] as const

const addressSchema = vine.object({
  street: vine.string().trim().minLength(2).maxLength(255),
  city: vine.string().trim().minLength(2).maxLength(120),
  country: vine.string().trim().maxLength(120).optional(),
  postal_code: vine.string().trim().maxLength(20).optional(),
  coordinates: vine
    .object({
      latitude: vine.number().min(-90).max(90).optional(),
      longitude: vine.number().min(-180).max(180).optional(),
    })
    .optional(),
})

const detailsSchema = vine.object({
  surface_area: vine.number().positive().optional(),
  bedrooms: vine.number().min(0).withoutDecimals(),
  bathrooms: vine.number().min(0).withoutDecimals(),
  living_rooms: vine.number().min(0).withoutDecimals(),
  kitchens: vine.number().min(0).withoutDecimals(),
  parking_spaces: vine.number().min(0).withoutDecimals(),
  floor_number: vine.number().withoutDecimals().optional(),
  total_floors: vine.number().min(0).withoutDecimals().optional(),
  year_built: vine.number().min(1800).max(2100).withoutDecimals().optional(),
  furnishing: vine.enum(FURNISHING).optional(),
})

const amenitiesSchema = vine
  .object({
    air_conditioning: vine.boolean().optional(),
    heating: vine.boolean().optional(),
    elevator: vine.boolean().optional(),
    balcony: vine.boolean().optional(),
    terrace: vine.boolean().optional(),
    garden: vine.boolean().optional(),
    pool: vine.boolean().optional(),
    gym: vine.boolean().optional(),
    security: vine.boolean().optional(),
    concierge: vine.boolean().optional(),
    wifi: vine.boolean().optional(),
    parking: vine.boolean().optional(),
    pet_friendly: vine.boolean().optional(),
    smoking_allowed: vine.boolean().optional(),
  })
  .optional()

const mediaSchema = vine
  .object({
    images: vine.array(vine.string().url()).optional(),
    videos: vine.array(vine.string().url()).optional(),
    virtual_tour: vine.string().url().optional(),
    floor_plan: vine.string().url().optional(),
  })
  .optional()

/**
 * Paliers de remise par durée.
 *
 * `discount_percent` est borné à 90 : une remise totale ferait un séjour
 * gratuit, ce qui relève de l'erreur de saisie et non d'une offre.
 */
const priceTiersSchema = vine
  .array(
    vine.object({
      min_days: vine.number().min(2).withoutDecimals(),
      discount_percent: vine.number().min(1).max(90),
    })
  )
  .optional()

const pricingSchema = vine.object({
  daily_price: vine.number().min(0),
  price_tiers: priceTiersSchema,
  minimum_stay_days: vine.number().min(1).withoutDecimals().optional(),
  maximum_stay_days: vine.number().min(1).withoutDecimals().optional(),
})

/**
 * POST /proprio/properties
 */
export const createPropertyValidator = vine.compile(
  vine.object({
    /** Résidence d’accueil : l’adresse en est alors copiée. */
    residence_id: vine.string().trim().minLength(1).optional(),
    unit_label: vine.string().trim().maxLength(120).optional(),
    title: vine.string().trim().minLength(3).maxLength(150),
    description: vine.string().trim().minLength(10).maxLength(5000),
    property_type: vine.enum(PROPERTY_TYPES),
    // Facultative pour une unité rattachée : le use case la copie depuis la
    // résidence et refuse en 422 un bien autonome sans adresse.
    address: addressSchema.optional(),
    details: detailsSchema,
    amenities: amenitiesSchema,
    media: mediaSchema,
    pricing: pricingSchema,
    charges_included: vine.boolean().optional(),
    additional_charges: vine.number().min(0).optional(),
    available_from: vine.date(),
  })
)

/**
 * PATCH /proprio/properties/:id
 */
export const updatePropertyValidator = vine.compile(
  vine.object({
    // `residence_id` est absent : le rattachement passe par une route dédiée,
    // qui déplace les compteurs des deux résidences et peut copier l’adresse.
    unit_label: vine.string().trim().maxLength(120).nullable().optional(),
    title: vine.string().trim().minLength(3).maxLength(150).optional(),
    description: vine.string().trim().minLength(10).maxLength(5000).optional(),
    property_type: vine.enum(PROPERTY_TYPES).optional(),
    // `reserved` et `rented` sont exclus : la disponibilité se déduit
    // désormais des dates de réservation (voir `availability.ts`). Les laisser
    // poser à la main réintroduirait l'état bloqué qu'aucun flux ne remettait
    // à zéro.
    status: vine.enum(OWNER_SETTABLE_STATUSES).optional(),
    address: addressSchema.optional(),
    details: detailsSchema.optional(),
    amenities: amenitiesSchema,
    media: mediaSchema,
    pricing: pricingSchema.optional(),
    charges_included: vine.boolean().optional(),
    additional_charges: vine.number().min(0).optional(),
    available_from: vine.date().optional(),
    // `visibility` est délibérément absent : la mise en ligne passe par
    // `publish`/`unpublish`, qui exigent un dossier d'identité déposé et
    // posent `published_at`. L'accepter ici permettait de publier une annonce
    // sans ce contrôle, et sans horodater la mise en ligne.
    //
    // `featured` relève par ailleurs de l'administration, pas du
    // propriétaire : il pouvait se mettre lui-même en avant.
  })
)

/**
 * GET /proprio/properties
 */
export const listOwnerPropertiesValidator = vine.compile(
  vine.object({
    // Unités d'une résidence, pour sa fiche de détail. Le contrôle de
    // propriété reste porté par `owner_id`, posé par le contrôleur : un
    // identifiant deviné ne doit pas lister le parc d'un autre compte.
    residence_id: vine.string().trim().minLength(1).optional(),
    status: vine.enum(PROPERTY_STATUSES).optional(),
    property_type: vine.enum(PROPERTY_TYPES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
    sort: vine.string().trim().optional(),
  })
)

/**
 * GET /client/properties
 */
export const listPublicPropertiesValidator = vine.compile(
  vine.object({
    property_type: vine.enum(PROPERTY_TYPES).optional(),
    city: vine.string().trim().optional(),
    min_price: vine.number().min(0).optional(),
    max_price: vine.number().min(0).optional(),
    min_surface: vine.number().min(0).optional(),
    max_surface: vine.number().min(0).optional(),
    min_bedrooms: vine.number().min(0).withoutDecimals().optional(),
    furnished: vine.enum(FURNISHING).optional(),
    featured: vine.boolean().optional(),
    available_from: vine.date().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
    sort: vine.string().trim().optional(),
  })
)

/**
 * PATCH /gerant/properties/:id/availability
 *
 * Le gérant tient la disponibilité de ses logements, et rien d'autre : ni
 * tarif, ni description, ni mise en ligne. Un schéma dédié plutôt que
 * `updatePropertyValidator` restreint : celui-ci accepte `pricing`, et le
 * rouvrir au gérant lui donnerait la main sur la grille tarifaire du
 * propriétaire.
 *
 * `reserved` et `rented` en sont absents pour la même raison que côté
 * propriétaire : l'occupation se déduit des réservations.
 */
export const updateAvailabilityValidator = vine.compile(
  vine.object({
    status: vine.enum(OWNER_SETTABLE_STATUSES),
    available_from: vine.date().optional(),
  })
)

/**
 * GET /admin/properties
 *
 * Tous propriétaires confondus. Les filtres se limitent aux égalités couvertes
 * par un index : une recherche par ville ou par prix rapatrierait le catalogue
 * entier de la plateforme.
 */
export const listPlatformPropertiesValidator = vine.compile(
  vine.object({
    owner_id: vine.string().trim().minLength(1).optional(),
    residence_id: vine.string().trim().minLength(1).optional(),
    status: vine.enum(PROPERTY_STATUSES).optional(),
    property_type: vine.enum(PROPERTY_TYPES).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    per_page: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
