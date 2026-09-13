import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  transaction,
  type WithId,
} from '#firebase/firestore'

export const PROMO_CODE_TYPES = ['percentage', 'fixed'] as const
export type PromoCodeType = (typeof PROMO_CODE_TYPES)[number]

export interface PromoCodeDocument {
  code: string
  type: PromoCodeType
  value: number
  min_amount: number | null
  max_uses: number | null
  uses_count: number
  max_uses_per_user: number
  starts_at: Date | null
  expires_at: Date | null
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type PromoCodeRecord = WithId<PromoCodeDocument>

function promoCodes() {
  return collection<PromoCodeDocument>(COLLECTIONS.promoCodes)
}

/** Normalise un code : sans espaces, en majuscules. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * Codes promotionnels.
 *
 * **Le code normalisé est l'identifiant du document.** Il était déjà unique et
 * en majuscules ; en faire la clé rend la recherche par code — le seul accès du
 * flux de réservation — directe, et fait respecter l'unicité que Firestore ne
 * sait pas déclarer.
 */
const PromoCode = {
  async findById(id: string): Promise<PromoCodeRecord | null> {
    if (!id) return null
    return toDoc<PromoCodeDocument>(await promoCodes().doc(id).get())
  },

  /** Lecture par code : accès direct, le code étant la clé. */
  async findByCode(code: string): Promise<PromoCodeRecord | null> {
    return PromoCode.findById(normalizeCode(code))
  },

  async create(input: {
    code: string
    type: PromoCodeType
    value: number
    min_amount?: number | null
    max_uses?: number | null
    max_uses_per_user?: number
    starts_at?: Date | null
    expires_at?: Date | null
    is_active?: boolean
  }): Promise<PromoCodeRecord> {
    const now = new Date()
    const code = normalizeCode(input.code)

    const payload: PromoCodeDocument = {
      code,
      type: input.type,
      value: input.value,
      min_amount: input.min_amount ?? null,
      max_uses: input.max_uses ?? null,
      uses_count: 0,
      max_uses_per_user: input.max_uses_per_user ?? 1,
      starts_at: input.starts_at ?? null,
      expires_at: input.expires_at ?? null,
      is_active: input.is_active ?? true,
      created_at: now,
      updated_at: now,
    }

    const docRef = promoCodes().doc(code)
    const existing = await docRef.get()
    if (existing.exists) {
      throw new Error(`Le code promo « ${code} » existe déjà.`)
    }

    await docRef.set(toPayload(payload) as unknown as PromoCodeDocument)
    return { ...payload, _id: code }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<Omit<PromoCodeDocument, 'code' | 'created_at'>>
  ): Promise<PromoCodeRecord | null> {
    const docRef = promoCodes().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return null

    await docRef.update(toPayload({ ...patch, updated_at: new Date() }))
    return PromoCode.findById(id)
  },

  async deleteOne(id: string): Promise<boolean> {
    const docRef = promoCodes().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return false

    await docRef.delete()
    return true
  },

  /**
   * Réserve une utilisation du code, de façon atomique.
   *
   * Mongo l'exprimait en une passe :
   * `updateOne({ _id, $or: [{max_uses: null}, {$expr: {$lt: ['$uses_count','$max_uses']}}] }, {$inc:{uses_count:1}})`
   *
   * Firestore ne sait pas comparer deux champs d'un même document dans un
   * filtre. La garantie est reportée sur une transaction : on relit le compteur
   * et on ne l'incrémente que si le quota le permet. Deux réservations
   * simultanées du dernier exemplaire ne peuvent donc pas passer toutes deux —
   * la seconde voit la valeur mise à jour et échoue.
   *
   * @returns le compteur après incrément
   * @throws `promo_usage_limit_reached` si le quota est atteint
   */
  async reserveUse(id: string): Promise<number> {
    return transaction(async (tx) => {
      const docRef = promoCodes().doc(id)
      const snapshot = await tx.get(docRef)
      const promo = toDoc<PromoCodeDocument>(snapshot)

      if (!promo) {
        throw new Error('invalid_promo_code')
      }

      if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        throw new Error('promo_usage_limit_reached')
      }

      const next = promo.uses_count + 1
      tx.update(docRef, { uses_count: next, updated_at: new Date() })
      return next
    })
  },

  /** Annule une réservation d'utilisation (réservation abandonnée). */
  async releaseUse(id: string): Promise<void> {
    await transaction(async (tx) => {
      const docRef = promoCodes().doc(id)
      const promo = toDoc<PromoCodeDocument>(await tx.get(docRef))
      if (!promo) return

      // Le compteur ne descend pas sous zéro : une double libération ne doit
      // pas créer de crédit d'utilisation fictif.
      tx.update(docRef, {
        uses_count: Math.max(0, promo.uses_count - 1),
        updated_at: new Date(),
      })
    })
  },

  async paginate(options: {
    isActive?: boolean
    limit: number
    offset: number
  }): Promise<{ data: PromoCodeRecord[]; total: number }> {
    let base = promoCodes() as FirebaseFirestore.Query<PromoCodeDocument>
    if (typeof options.isActive === 'boolean') {
      base = base.where('is_active', '==', options.isActive)
    }

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<PromoCodeDocument>(snapshot.docs), total }
  },
}

export default PromoCode
