import {
  COLLECTIONS,
  collection,
  countQuery,
  increment,
  toDoc,
  toDocs,
  toMergePayload,
  toPayload,
  type WithId,
} from '#firebase/firestore'

/**
 * Lieu regroupant plusieurs logements loués séparément — « Resi Adja » et ses
 * trois unités.
 *
 * Distincte de `properties`, qui reste l'unité louable : une résidence ne se
 * loue pas, elle porte l'adresse, les parties communes et les charges
 * communes. Poser la réservation sur la résidence rendrait ses unités
 * mutuellement exclusives, alors que deux studios doivent pouvoir être loués
 * la même nuit.
 *
 * Voir `docs/specs/residences-design.md`.
 */

export interface ResidenceCoordinates {
  latitude: number | null
  longitude: number | null
}

export interface ResidenceAddress {
  street: string
  city: string
  country: string
  postal_code: string | null
  coordinates: ResidenceCoordinates
}

export interface ResidenceMedia {
  images: string[]
  videos: string[]
}

/**
 * Équipements des parties communes.
 *
 * Volontairement plus court que `PropertyAmenities` : ne figurent ici que les
 * équipements qui appartiennent au lieu et non au logement. La climatisation
 * ou le balcon restent sur l'unité, où ils varient d'un studio à l'autre.
 */
export interface ResidenceAmenities {
  pool: boolean
  gym: boolean
  security: boolean
  concierge: boolean
  elevator: boolean
  parking: boolean
  garden: boolean
  wifi: boolean
}

export interface ResidenceDocument {
  owner_id: string
  name: string
  description: string

  address: ResidenceAddress
  media: ResidenceMedia
  amenities: ResidenceAmenities

  /**
   * Nombre d'unités rattachées.
   *
   * Dénormalisé : Firestore ne sait pas compter les unités de chaque résidence
   * en une requête, et une liste de résidences en exigerait une par ligne.
   * Ajusté par `increment()`, comme `metadata.views_count` sur un bien.
   */
  units_count: number

  created_at: Date
  updated_at: Date
}

export type ResidenceRecord = WithId<ResidenceDocument>

function residences() {
  return collection<ResidenceDocument>(COLLECTIONS.residences)
}

const DEFAULT_AMENITIES: ResidenceAmenities = {
  pool: false,
  gym: false,
  security: false,
  concierge: false,
  elevator: false,
  parking: false,
  garden: false,
  wifi: false,
}

function withDefaults(
  input: Partial<Omit<ResidenceDocument, 'amenities'>> & {
    amenities?: Partial<ResidenceAmenities>
  }
): ResidenceDocument {
  const now = new Date()

  return {
    owner_id: input.owner_id ?? '',
    name: input.name?.trim() ?? '',
    description: input.description?.trim() ?? '',
    address: {
      street: input.address?.street?.trim() ?? '',
      city: input.address?.city?.trim() ?? '',
      country: input.address?.country?.trim() || 'CI',
      postal_code: input.address?.postal_code?.trim() || null,
      coordinates: {
        latitude: input.address?.coordinates?.latitude ?? null,
        longitude: input.address?.coordinates?.longitude ?? null,
      },
    },
    media: {
      images: input.media?.images ?? [],
      videos: input.media?.videos ?? [],
    },
    amenities: { ...DEFAULT_AMENITIES, ...input.amenities },
    units_count: input.units_count ?? 0,
    created_at: input.created_at ?? now,
    updated_at: now,
  }
}

export interface ResidenceFilters {
  owner_id: string
}

const Residence = {
  async findById(id: string): Promise<ResidenceRecord | null> {
    if (!id) return null
    return toDoc<ResidenceDocument>(await residences().doc(id).get())
  },

  /** Lecture restreinte à son propriétaire, pour l'espace privé. */
  async findByIdAndOwner(id: string, ownerId: string): Promise<ResidenceRecord | null> {
    const residence = await Residence.findById(id)
    if (!residence || residence.owner_id !== ownerId) return null
    return residence
  },

  async create(
    input: Partial<Omit<ResidenceDocument, 'amenities'>> & {
      amenities?: Partial<ResidenceAmenities>
    }
  ): Promise<ResidenceRecord> {
    const payload = withDefaults(input)
    const docRef = await residences().add(toPayload(payload) as unknown as ResidenceDocument)

    return { ...payload, _id: docRef.id }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Record<string, unknown>,
    ownerId?: string
  ): Promise<ResidenceRecord | null> {
    const snapshot = await residences().doc(id).get()
    if (!snapshot.exists) return null

    // Périmètre vérifié avant écriture : sans ce contrôle, un identifiant
    // deviné suffirait à modifier la résidence d'autrui.
    if (ownerId) {
      const data = snapshot.data() as ResidenceDocument | undefined
      if (data?.owner_id !== ownerId) return null
    }

    // `toMergePayload` : le patch porte des objets partiels (`address`,
    // `amenities`), et un `update` par objet remplacerait l'objet entier.
    await residences()
      .doc(id)
      .update(toMergePayload({ ...patch, updated_at: new Date() }))

    return Residence.findById(id)
  },

  async deleteOne(id: string, ownerId?: string): Promise<boolean> {
    const docRef = residences().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return false

    if (ownerId) {
      const data = snapshot.data() as ResidenceDocument | undefined
      if (data?.owner_id !== ownerId) return false
    }

    await docRef.delete()
    return true
  },

  /**
   * Ajuste le compteur d'unités.
   *
   * Incrément atomique plutôt qu'un lire-puis-écrire : deux unités créées en
   * même temps sur la même résidence n'en perdent aucune.
   */
  async adjustUnitsCount(id: string, by: number): Promise<void> {
    if (!id || by === 0) return
    await residences()
      .doc(id)
      .update({ units_count: increment(by), updated_at: new Date() })
  },

  async paginate(
    filters: ResidenceFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: ResidenceRecord[]; total: number }> {
    const base = residences().where('owner_id', '==', filters.owner_id)

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<ResidenceDocument>(snapshot.docs), total }
  },
}

export default Residence
