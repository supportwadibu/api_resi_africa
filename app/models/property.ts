import { FieldPath } from 'firebase-admin/firestore'

import { FIRESTORE_IN_LIMIT } from '#features/managers/scope'
import {
  collection,
  COLLECTIONS,
  countQuery,
  increment,
  serverTimestamp,
  sumQuery,
  toDoc,
  toDocs,
  toMergePayload,
  toPayload,
  type WithId,
} from '#firebase/firestore'

const PROPERTY_STATUSES = [
  'draft',
  'published',
  'reserved',
  'rented',
  'maintenance',
  'inactive',
] as const
const PROPERTY_TYPES = ['apartment', 'studio', 'villa', 'duplex'] as const
const FURNISHING_TYPES = ['unfurnished', 'semi_furnished', 'furnished'] as const

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number]
export type PropertyType = (typeof PROPERTY_TYPES)[number]
export type FurnishingType = (typeof FURNISHING_TYPES)[number]

export interface PropertyCoordinates {
  latitude: number | null
  longitude: number | null
}

export interface PropertyAddress {
  street: string
  city: string
  country: string
  postal_code: string | null
  coordinates: PropertyCoordinates
}

export interface PropertyDetails {
  /** Surface habitable en m², `null` lorsque le propriétaire ne l'a pas saisie. */
  surface_area: number | null
  bedrooms: number
  bathrooms: number
  living_rooms: number
  kitchens: number
  parking_spaces: number
  floor_number: number | null
  total_floors: number | null
  year_built: number | null
  furnishing: FurnishingType
}

export interface PropertyAmenities {
  air_conditioning: boolean
  heating: boolean
  elevator: boolean
  balcony: boolean
  terrace: boolean
  garden: boolean
  pool: boolean
  gym: boolean
  security: boolean
  concierge: boolean
  wifi: boolean
  parking: boolean
  pet_friendly: boolean
  smoking_allowed: boolean
}

export interface PropertyMedia {
  images: string[]
  videos: string[]
  virtual_tour: string | null
  floor_plan: string | null
}

/**
 * Réduction accordée à partir d'une certaine durée de séjour.
 *
 * Le prix par jour reste l'unique référence : un palier ne fixe pas un montant,
 * il applique un pourcentage de remise sur l'ensemble du séjour dès que celui-ci
 * atteint `min_days`.
 */
export interface PropertyPriceTier {
  /** Durée à partir de laquelle la remise s'applique, en jours. */
  min_days: number
  /** Pourcentage de remise, de 1 à 100. */
  discount_percent: number
}

export interface PropertyPricing {
  /** Tarif d'une journée d'occupation (12h → 12h le lendemain). */
  daily_price: number
  /**
   * Paliers de remise par durée, du plus court au plus long.
   *
   * Modifiables par le propriétaire à tout moment ; un séjour déjà réservé
   * conserve le tarif figé au moment de sa création.
   */
  price_tiers: PropertyPriceTier[]
  minimum_stay_days: number
  maximum_stay_days: number | null
}

export interface PropertyVisibility {
  is_public: boolean
  featured: boolean
  published_at: Date | null
}

export interface PropertyRentalInfo {
  current_tenant_id: string | null
  last_rent_payment_date: Date | null
}

export interface PropertyMetadata {
  views_count: number
  contact_requests_count: number
  last_viewed_at: Date | null
}

export interface PropertyDocument {
  owner_id: string
  /**
   * Résidence à laquelle l'unité appartient, `null` pour un bien autonome.
   *
   * Optionnel en lecture : les biens écrits avant l'introduction des
   * résidences n'en portent pas, et valent `null` — le comportement d'origine.
   */
  residence_id?: string | null
  /** Nom de l'unité dans sa résidence — « Studio 1 ». */
  unit_label?: string | null
  title: string
  description: string
  property_type: PropertyType
  status: PropertyStatus

  address: PropertyAddress
  details: PropertyDetails
  amenities: PropertyAmenities
  media: PropertyMedia

  pricing: PropertyPricing
  charges_included: boolean
  additional_charges: number

  available_from: Date

  visibility: PropertyVisibility
  rental_info: PropertyRentalInfo
  metadata: PropertyMetadata

  created_at: Date
  updated_at: Date
}

export type PropertyRecord = WithId<PropertyDocument>

function properties() {
  return collection<PropertyDocument>(COLLECTIONS.properties)
}

const DEFAULT_AMENITIES: PropertyAmenities = {
  air_conditioning: false,
  heating: false,
  elevator: false,
  balcony: false,
  terrace: false,
  garden: false,
  pool: false,
  gym: false,
  security: false,
  concierge: false,
  wifi: false,
  parking: false,
  pet_friendly: false,
  smoking_allowed: false,
}

/**
 * Ordonne les paliers par durée croissante et écarte les doublons de `min_days`.
 *
 * Le calcul de prix retient le dernier palier atteint : une liste désordonnée
 * appliquerait une remise arbitraire. Le propriétaire pouvant réordonner ses
 * paliers à chaque modification, la normalisation se fait à l'écriture.
 */
export function normalizePriceTiers(tiers?: PropertyPriceTier[] | null): PropertyPriceTier[] {
  if (!tiers?.length) return []

  const byMinDays = new Map<number, PropertyPriceTier>()
  for (const tier of tiers) {
    // Le dernier gagne : à `min_days` égal, la valeur la plus récemment saisie
    // est celle que le propriétaire vient de poser.
    byMinDays.set(tier.min_days, tier)
  }

  return [...byMinDays.values()].sort((a, b) => a.min_days - b.min_days)
}

/** Applique les valeurs par défaut de l'ancien schéma Mongoose. */
function withDefaults(input: Partial<PropertyDocument>): PropertyDocument {
  const now = new Date()

  return {
    owner_id: input.owner_id ?? '',
    residence_id: input.residence_id ?? null,
    unit_label: input.unit_label?.trim() || null,
    title: input.title?.trim() ?? '',
    description: input.description ?? '',
    property_type: input.property_type ?? 'apartment',
    status: input.status ?? 'draft',

    address: {
      street: input.address?.street ?? '',
      city: input.address?.city ?? '',
      country: input.address?.country ?? 'Sénégal',
      postal_code: input.address?.postal_code ?? null,
      coordinates: {
        latitude: input.address?.coordinates?.latitude ?? null,
        longitude: input.address?.coordinates?.longitude ?? null,
      },
    },

    details: {
      surface_area: input.details?.surface_area ?? null,
      bedrooms: input.details?.bedrooms ?? 0,
      bathrooms: input.details?.bathrooms ?? 0,
      living_rooms: input.details?.living_rooms ?? 0,
      kitchens: input.details?.kitchens ?? 0,
      parking_spaces: input.details?.parking_spaces ?? 0,
      floor_number: input.details?.floor_number ?? null,
      total_floors: input.details?.total_floors ?? null,
      year_built: input.details?.year_built ?? null,
      furnishing: input.details?.furnishing ?? 'unfurnished',
    },

    amenities: { ...DEFAULT_AMENITIES, ...(input.amenities ?? {}) },

    media: {
      images: input.media?.images ?? [],
      videos: input.media?.videos ?? [],
      virtual_tour: input.media?.virtual_tour ?? null,
      floor_plan: input.media?.floor_plan ?? null,
    },

    pricing: {
      daily_price: input.pricing?.daily_price ?? 0,
      // Triés par durée croissante : le calcul retient le dernier palier
      // atteint, ce qui n'a de sens que sur une liste ordonnée.
      price_tiers: normalizePriceTiers(input.pricing?.price_tiers),
      minimum_stay_days: input.pricing?.minimum_stay_days ?? 1,
      maximum_stay_days: input.pricing?.maximum_stay_days ?? null,
    },
    charges_included: input.charges_included ?? false,
    additional_charges: input.additional_charges ?? 0,

    available_from: input.available_from ?? now,

    visibility: {
      is_public: input.visibility?.is_public ?? true,
      featured: input.visibility?.featured ?? false,
      published_at: input.visibility?.published_at ?? null,
    },

    rental_info: {
      current_tenant_id: input.rental_info?.current_tenant_id ?? null,
      last_rent_payment_date: input.rental_info?.last_rent_payment_date ?? null,
    },

    metadata: {
      views_count: input.metadata?.views_count ?? 0,
      contact_requests_count: input.metadata?.contact_requests_count ?? 0,
      last_viewed_at: input.metadata?.last_viewed_at ?? null,
    },

    created_at: input.created_at ?? now,
    updated_at: now,
  }
}

/** Critères de recherche du catalogue public et de l'espace propriétaire. */
export interface PropertyFilters {
  owner_id?: string
  /** Unités d'une résidence donnée. */
  residence_id?: string
  status?: PropertyStatus
  property_type?: PropertyType
  city?: string
  furnishing?: FurnishingType
  is_public?: boolean
  featured?: boolean
  min_price?: number
  max_price?: number
  min_surface?: number
  max_surface?: number
  min_bedrooms?: number
  available_from?: Date
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
}

/**
 * Filtres traduisibles en contraintes Firestore (égalités uniquement).
 *
 * Firestore n'accepte qu'un seul champ en inégalité par requête. Les bornes
 * numériques et de date sont donc évaluées en mémoire (voir `matchesInMemory`),
 * ce qui reste correct mais suppose de rapatrier les documents correspondant
 * aux égalités. Le catalogue étant filtré par ville et par statut, l'ensemble
 * reste borné.
 */
function buildQuery(filters: PropertyFilters): FirebaseFirestore.Query<PropertyDocument> {
  let query = properties() as FirebaseFirestore.Query<PropertyDocument>

  if (filters.owner_id) query = query.where('owner_id', '==', filters.owner_id)
  if (filters.residence_id) query = query.where('residence_id', '==', filters.residence_id)
  if (filters.status) query = query.where('status', '==', filters.status)
  if (filters.property_type) query = query.where('property_type', '==', filters.property_type)
  if (filters.furnishing) query = query.where('details.furnishing', '==', filters.furnishing)
  if (typeof filters.is_public === 'boolean') {
    query = query.where('visibility.is_public', '==', filters.is_public)
  }
  if (typeof filters.featured === 'boolean') {
    query = query.where('visibility.featured', '==', filters.featured)
  }

  // Le périmètre désigne des documents, pas la valeur d'un champ : le filtre
  // porte donc sur `FieldPath.documentId()`. Délégué à Firestore tant que la
  // liste tient dans la limite de l'opérateur `in` ; au-delà, `matchesInMemory`
  // reprend après lecture.
  const ids = filters.scope_property_ids
  if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
    query = query.where(FieldPath.documentId(), 'in', ids)
  }

  return query
}

/**
 * Applique les critères que Firestore ne sait pas exprimer.
 *
 * - **Ville** : Mongo utilisait une regex insensible à la casse. Firestore ne
 *   fait que de l'égalité stricte ; la comparaison est donc normalisée ici.
 * - **Bornes numériques et date** : plusieurs inégalités sur des champs
 *   différents sont interdites dans une même requête Firestore.
 */
export function matchesInMemory(doc: PropertyRecord, filters: PropertyFilters): boolean {
  if (filters.city) {
    const wanted = filters.city.trim().toLowerCase()
    if (!doc.address.city?.toLowerCase().includes(wanted)) return false
  }

  // Les bornes portent sur le tarif journalier — l'unité dans laquelle le bien
  // est loué, et celle que le client voit dans les résultats.
  const dailyPrice = doc.pricing?.daily_price ?? 0
  if (typeof filters.min_price === 'number' && dailyPrice < filters.min_price) return false
  if (typeof filters.max_price === 'number' && dailyPrice > filters.max_price) return false

  // Une surface non renseignée ne peut satisfaire aucune borne : le bien est
  // écarté dès qu'un filtre de surface est demandé, plutôt que compté comme
  // 0 m² — ce qui l'aurait fait remonter sur tout `max_surface`.
  const surface = doc.details.surface_area
  const filtersSurface =
    typeof filters.min_surface === 'number' || typeof filters.max_surface === 'number'
  if (filtersSurface && surface === null) return false
  if (surface !== null) {
    if (typeof filters.min_surface === 'number' && surface < filters.min_surface) return false
    if (typeof filters.max_surface === 'number' && surface > filters.max_surface) return false
  }

  if (typeof filters.min_bedrooms === 'number' && doc.details.bedrooms < filters.min_bedrooms) {
    return false
  }

  if (filters.available_from && doc.available_from.getTime() > filters.available_from.getTime()) {
    return false
  }

  // Le périmètre est repris ici dans les deux cas où `buildQuery` n'a pas pu le
  // confier à Firestore — périmètre vide, ou de plus de 30 logements, où `in`
  // lève. L'appartenance se juge sur l'identifiant du document : c'est le bien
  // lui-même qui est confié au gérant.
  const scopeIds = filters.scope_property_ids
  if (Array.isArray(scopeIds) && !scopeIds.includes(doc._id)) return false

  return true
}

/**
 * Le périmètre reste-t-il à appliquer en mémoire ?
 *
 * Vrai pour les deux listes que `buildQuery` n'a pas pu confier à Firestore :
 * la liste vide et celle de plus de 30 entrées, où l'opérateur `in` lève. Sans
 * ce second passage, la requête ne porterait aucune restriction et un gérant
 * verrait tout le catalogue du propriétaire.
 */
export function needsInMemoryScope(filters: PropertyFilters): boolean {
  const ids = filters.scope_property_ids
  return Array.isArray(ids) && (ids.length === 0 || ids.length > FIRESTORE_IN_LIMIT)
}

/** Agrégats du parc, dans la forme rendue par `statsByOwner`. */
export interface OwnerPropertyStats {
  total: number
  published: number
  rented: number
  draft: number
  total_views: number
}

/**
 * Les agrégats serveur doivent-ils céder la place à un comptage en mémoire ?
 *
 * Vrai pour les deux listes que Firestore ne sait pas passer à `in` : la liste
 * vide et celle de plus de 30 entrées. Faux sans périmètre, ce qui laisse le
 * chemin du propriétaire strictement inchangé — cinq agrégats serveur, aucun
 * document rapatrié.
 */
export function needsInMemoryStats(scopePropertyIds?: string[] | null): boolean {
  if (!Array.isArray(scopePropertyIds)) return false
  return scopePropertyIds.length === 0 || scopePropertyIds.length > FIRESTORE_IN_LIMIT
}

/**
 * Recompose les agrégats du parc depuis les documents.
 *
 * Employé quand le périmètre ne peut être confié à Firestore : les agrégats
 * serveur ne savent pas filtrer sur une liste que `in` refuse, et les laisser
 * porter sur `owner_id` seul livrerait au gérant la taille du parc entier —
 * qui sert de dénominateur au taux d'occupation.
 *
 * `metadata.views_count` est lu avec un repli : les biens antérieurs au
 * compteur ne le portent pas.
 */
export function computeStatsInMemory(docs: readonly PropertyRecord[]): OwnerPropertyStats {
  const stats: OwnerPropertyStats = { total: 0, published: 0, rented: 0, draft: 0, total_views: 0 }

  for (const doc of docs) {
    stats.total += 1
    if (doc.status === 'published') stats.published += 1
    if (doc.status === 'rented') stats.rented += 1
    if (doc.status === 'draft') stats.draft += 1
    stats.total_views += doc.metadata?.views_count ?? 0
  }

  return stats
}

/**
 * Restreint une liste d'identifiants à un périmètre.
 *
 * `null` ou `undefined` signifie « aucune restriction » — la liste est rendue
 * intacte —, et se distingue du tableau vide, qui ne laisse rien passer.
 */
export function intersectScope(ids: string[], scopePropertyIds?: string[] | null): string[] {
  if (!Array.isArray(scopePropertyIds)) return ids

  const allowed = new Set(scopePropertyIds)
  return ids.filter((id) => allowed.has(id))
}

/** Indique si des critères doivent être évalués en mémoire. */
function needsInMemoryFilter(filters: PropertyFilters): boolean {
  return (
    needsInMemoryScope(filters) ||
    Boolean(filters.city) ||
    typeof filters.min_price === 'number' ||
    typeof filters.max_price === 'number' ||
    typeof filters.min_surface === 'number' ||
    typeof filters.max_surface === 'number' ||
    typeof filters.min_bedrooms === 'number' ||
    Boolean(filters.available_from)
  )
}

const Property = {
  async findById(id: string): Promise<PropertyRecord | null> {
    if (!id) return null
    return toDoc<PropertyDocument>(await properties().doc(id).get())
  },

  async create(input: Partial<PropertyDocument>): Promise<PropertyRecord> {
    const payload = withDefaults(input)
    const docRef = await properties().add(toPayload(payload) as unknown as PropertyDocument)
    return { ...payload, _id: docRef.id }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Record<string, unknown>,
    ownerId?: string
  ): Promise<PropertyRecord | null> {
    const snapshot = await properties().doc(id).get()
    if (!snapshot.exists) return null

    // Le périmètre propriétaire est vérifié avant écriture : il portait sur le
    // filtre du `findOneAndUpdate` côté Mongo.
    if (ownerId) {
      const data = snapshot.data() as PropertyDocument | undefined
      if (data?.owner_id !== ownerId) return null
    }

    // `toMergePayload` et non `toPayload` : le patch porte des objets partiels
    // (`details`, `pricing`, `address`), et un `update` par objet remplacerait
    // l'objet entier — un PATCH sur le seul `daily_price` effaçait
    // `price_tiers` et toute la grille de remises.
    await properties()
      .doc(id)
      .update(toMergePayload({ ...patch, updated_at: new Date() }))
    return Property.findById(id)
  },

  /** Lecture restreinte à un propriétaire, pour l'espace privé. */
  async findByIdAndOwner(id: string, ownerId: string): Promise<PropertyRecord | null> {
    const property = await Property.findById(id)
    if (!property || property.owner_id !== ownerId) return null
    return property
  },

  /**
   * Supprime un bien, éventuellement restreint à son propriétaire.
   * Sans ce contrôle, un identifiant deviné suffirait à supprimer le bien
   * d'autrui.
   */
  async deleteOne(id: string, ownerId?: string): Promise<boolean> {
    const docRef = properties().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return false

    if (ownerId) {
      const data = snapshot.data() as PropertyDocument | undefined
      if (data?.owner_id !== ownerId) return false
    }

    await docRef.delete()
    return true
  },

  /**
   * Liste paginée.
   *
   * Deux chemins selon les critères :
   *
   * - **Égalités seules** — pagination déléguée à Firestore, et comptage par
   *   agrégat serveur. C'est le cas courant (catalogue d'un propriétaire,
   *   biens publiés).
   * - **Bornes ou recherche par ville** — Firestore ne sachant pas combiner
   *   plusieurs inégalités, les documents correspondant aux égalités sont
   *   rapatriés, filtrés puis découpés en mémoire. `total` reflète alors le
   *   nombre réel de correspondances, pas le nombre de documents lus.
   */
  async paginate(
    filters: PropertyFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: PropertyRecord[]; total: number }> {
    const base = buildQuery(filters)

    if (!needsInMemoryFilter(filters)) {
      const [snapshot, total] = await Promise.all([
        base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
        countQuery(base),
      ])
      return { data: toDocs<PropertyDocument>(snapshot.docs), total }
    }

    const snapshot = await base.orderBy('created_at', 'desc').get()
    const matching = toDocs<PropertyDocument>(snapshot.docs).filter((doc) =>
      matchesInMemory(doc, filters)
    )

    return {
      data: matching.slice(options.offset, options.offset + options.limit),
      total: matching.length,
    }
  },

  async count(filters: PropertyFilters): Promise<number> {
    if (!needsInMemoryFilter(filters)) {
      return countQuery(buildQuery(filters))
    }

    const snapshot = await buildQuery(filters).get()
    return toDocs<PropertyDocument>(snapshot.docs).filter((doc) => matchesInMemory(doc, filters))
      .length
  },

  /**
   * Incrémente le compteur de vues.
   *
   * `increment` est appliqué côté serveur : deux consultations simultanées
   * s'additionnent au lieu de s'écraser.
   */
  async recordView(id: string): Promise<void> {
    await properties()
      .doc(id)
      .update({
        'metadata.views_count': increment(1),
        'metadata.last_viewed_at': serverTimestamp(),
      })
  },

  /**
   * Statistiques d'un propriétaire.
   *
   * Remplace le pipeline d'agrégation Mongo par des agrégats serveur : quatre
   * comptages et une somme, tous calculés sans rapatrier les documents.
   */
  /**
   * Identifiants des unités d'une résidence.
   *
   * Nécessaire au relevé financier : les charges d'une résidence sont ses
   * charges communes **plus** celles de ses unités, et Firestore ne sait pas
   * joindre les deux collections.
   *
   * `scopePropertyIds` restreint le résultat au périmètre de l'appelant. Absent
   * ou `null`, la liste est celle de toutes les unités — aucun appelant existant
   * ne change de comportement. Sans cette restriction, une résidence de dix
   * logements dont six sont confiés rendrait ses dix unités, et le taux
   * d'occupation du gérant serait divisé par une capacité qui n'est pas la
   * sienne.
   */
  async findIdsByResidence(
    residenceId: string,
    scopePropertyIds?: string[] | null
  ): Promise<string[]> {
    if (!residenceId) return []
    const snapshot = await properties().where('residence_id', '==', residenceId).select().get()

    // Intersection en mémoire plutôt qu'un second `where` : la requête porte
    // déjà sur `residence_id`, et le `in` sur `documentId()` refuserait la
    // liste vide comme celle de plus de 30 logements.
    return intersectScope(
      snapshot.docs.map((doc) => doc.id),
      scopePropertyIds
    )
  },

  /**
   * Nombre d'unités rattachées à une résidence.
   *
   * Compté sur `properties` plutôt que lu sur `units_count` : le compteur est
   * dénormalisé, et une suppression de résidence ne peut pas reposer sur une
   * valeur qui a pu dériver.
   */
  async countByResidence(residenceId: string): Promise<number> {
    if (!residenceId) return 0
    return countQuery(properties().where('residence_id', '==', residenceId))
  },

  /**
   * `scopePropertyIds` restreint les agrégats au périmètre de l'appelant.
   * Absent ou `null`, le chemin du propriétaire est strictement inchangé : cinq
   * agrégats serveur, aucun document rapatrié. C'est la lecture la plus
   * exposée — elle alimente le tableau de bord et le dénominateur du taux
   * d'occupation, et non restreinte elle révélerait au gérant la taille du parc
   * entier.
   */
  async statsByOwner(
    ownerId: string,
    scopePropertyIds?: string[] | null
  ): Promise<OwnerPropertyStats> {
    let base = properties().where(
      'owner_id',
      '==',
      ownerId
    ) as FirebaseFirestore.Query<PropertyDocument>

    // Les deux listes que `in` refuse — vide, ou de plus de 30 — imposent de
    // rapatrier les documents et de recompter : un agrégat serveur ne sait pas
    // filtrer ce que la requête n'exprime pas.
    if (needsInMemoryStats(scopePropertyIds)) {
      if (scopePropertyIds!.length === 0) {
        return { total: 0, published: 0, rented: 0, draft: 0, total_views: 0 }
      }

      const snapshot = await base.get()
      const scoped = toDocs<PropertyDocument>(snapshot.docs).filter((doc) =>
        scopePropertyIds!.includes(doc._id)
      )

      return computeStatsInMemory(scoped)
    }

    if (scopePropertyIds) {
      base = base.where(FieldPath.documentId(), 'in', scopePropertyIds)
    }

    const [total, published, rented, draft, totalViews] = await Promise.all([
      countQuery(base),
      countQuery(base.where('status', '==', 'published')),
      countQuery(base.where('status', '==', 'rented')),
      countQuery(base.where('status', '==', 'draft')),
      sumQuery(base, 'metadata.views_count'),
    ])

    return { total, published, rented, draft, total_views: totalViews }
  },
}

export default Property
export { FURNISHING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES }
