import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

import type { PlanTier } from '#features/plans/plan_tier'

export interface PlanDocument {
  name: string
  description: string
  /**
   * Mongo stockait un `Decimal128`, aussitôt reconverti en nombre par le
   * repository. Firestore n'a pas de type décimal : on garde un `number`, ce
   * qui reflète l'usage réel sans perte pour des montants d'abonnement.
   */
  price: number
  duration_days: number
  max_residences: number
  features: string[]
  /**
   * Palier ouvert par le plan. Optionnel en lecture : les plans créés avant
   * les paliers n'en portent pas et valent `full` (voir `readPlanTier`).
   */
  tier?: PlanTier
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export type PlanRecord = WithId<PlanDocument>

function plans() {
  return collection<PlanDocument>(COLLECTIONS.plans)
}

/**
 * Formules d'abonnement.
 *
 * L'unicité du nom était garantie par un index unique Mongo. Firestore n'en
 * dispose pas : `findByName` reste disponible pour un contrôle applicatif
 * avant création.
 */
const Plan = {
  async findById(id: string): Promise<PlanRecord | null> {
    if (!id) return null
    return toDoc<PlanDocument>(await plans().doc(id).get())
  },

  async findOne(filter: { name: string }): Promise<PlanRecord | null> {
    const snapshot = await plans().where('name', '==', filter.name).limit(1).get()
    return snapshot.empty ? null : toDoc<PlanDocument>(snapshot.docs[0])
  },

  async create(input: {
    name: string
    description?: string
    price: number
    duration_days: number
    max_residences: number
    features?: string[]
    tier: PlanTier
    is_active?: boolean
  }): Promise<PlanRecord> {
    const now = new Date()
    const payload: PlanDocument = {
      name: input.name,
      description: input.description ?? '',
      price: input.price,
      duration_days: input.duration_days,
      max_residences: input.max_residences,
      features: input.features ?? [],
      tier: input.tier,
      is_active: input.is_active ?? true,
      created_at: now,
      updated_at: now,
    }

    const docRef = await plans().add(toPayload(payload) as unknown as PlanDocument)
    return { ...payload, _id: docRef.id }
  },

  async findByIdAndUpdate(
    id: string,
    patch: Partial<Omit<PlanDocument, 'created_at'>>
  ): Promise<PlanRecord | null> {
    const existing = await plans().doc(id).get()
    if (!existing.exists) return null

    await plans()
      .doc(id)
      .update(toPayload({ ...patch, updated_at: new Date() }))
    return Plan.findById(id)
  },

  async deleteOne(id: string): Promise<boolean> {
    const docRef = plans().doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) return false

    await docRef.delete()
    return true
  },

  /**
   * Plans ouverts à la souscription.
   *
   * Sans pagination : le catalogue tient en quelques plans — deux paliers —
   * et le propriétaire doit tous les voir pour choisir.
   */
  async findActive(): Promise<PlanRecord[]> {
    const snapshot = await plans().where('is_active', '==', true).get()
    return toDocs<PlanDocument>(snapshot.docs)
  },

  /** Liste paginée, optionnellement filtrée sur l'activation. */
  async paginate(options: {
    isActive?: boolean
    limit: number
    offset: number
  }): Promise<{ data: PlanRecord[]; total: number }> {
    let base = plans() as FirebaseFirestore.Query<PlanDocument>
    if (typeof options.isActive === 'boolean') {
      base = base.where('is_active', '==', options.isActive)
    }

    const [snapshot, total] = await Promise.all([
      base.orderBy('created_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(base),
    ])

    return { data: toDocs<PlanDocument>(snapshot.docs), total }
  },
}

export default Plan
