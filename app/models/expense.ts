import { FIRESTORE_IN_LIMIT, isWithinScope } from '#features/managers/scope'
import { COLLECTIONS, collection, toDoc, toDocs, toPayload, type WithId } from '#firebase/firestore'

/**
 * Dépense engagée par un propriétaire, sur un bien ou sur une résidence.
 *
 * Deux rattachements possibles, et **exactement un** des deux :
 *
 * - `property_id` — charge d'un logement précis : ménage, réparation.
 * - `residence_id` — charge commune du lieu : électricité, gardien. Elle ne se
 *   rattache à aucune unité, et n'est répartie sur aucune : toute clé de
 *   répartition inventée produirait un bénéfice par unité faux avec
 *   l'apparence de la précision (voir `docs/specs/residences-design.md`).
 *
 * Sans rattachement, la dépense ne serait imputable nulle part ; avec les deux,
 * elle serait comptée deux fois dans un relevé de résidence.
 *
 * Un bien ou une résidence supprimé ne détruit pas ses dépenses, les
 * identifiants pouvant alors ne plus être résolus.
 */

export const EXPENSE_CATEGORIES = [
  'electricity',
  'water',
  'internet',
  'tv',
  'cleaning',
  'maintenance',
  'taxes',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface ExpenseDocument {
  owner_id: string
  /**
   * Bien concerné, `null` pour une charge commune de résidence.
   *
   * Historiquement obligatoire : les dépenses écrites avant l'introduction des
   * résidences en portent toujours un.
   */
  property_id: string | null
  /** Résidence concernée, `null` pour une charge de bien. */
  residence_id?: string | null
  category: ExpenseCategory
  amount: number
  /** Date à laquelle la dépense a été engagée, pas celle de la saisie. */
  spent_at: Date
  note: string | null

  /**
   * Acteur ayant réellement saisi l'enregistrement — un gérant, ou `null` pour
   * le propriétaire. Optionnel : absent sur les documents antérieurs au rôle
   * gérant. Donnée d'audit, n'entrant dans aucun calcul.
   */
  created_by?: string | null

  created_at: Date
  updated_at: Date
}

export type ExpenseRecord = WithId<ExpenseDocument>

function expenses() {
  return collection<ExpenseDocument>(COLLECTIONS.expenses)
}

function withDefaults(input: Partial<ExpenseDocument>): ExpenseDocument {
  const now = new Date()

  return {
    owner_id: input.owner_id ?? '',
    property_id: input.property_id ?? null,
    residence_id: input.residence_id ?? null,
    category: input.category ?? 'other',
    amount: input.amount ?? 0,
    spent_at: input.spent_at ?? now,
    note: input.note?.trim() || null,
    created_by: input.created_by ?? null,
    created_at: input.created_at ?? now,
    updated_at: now,
  }
}

export interface ExpenseFilters {
  owner_id?: string
  property_id?: string
  residence_id?: string
  category?: ExpenseCategory
  /** Bornes inclusives sur `spent_at`. */
  from?: Date
  to?: Date
  /**
   * Logements du périmètre de l'appelant. `null` ou absent = aucune
   * restriction. Alimenté par le middleware `scope()`.
   */
  scope_property_ids?: string[] | null
}

/**
 * Contraintes traduisibles en égalités Firestore.
 *
 * Les bornes de date sont volontairement laissées de côté : combinées au tri
 * sur `spent_at`, elles resteraient valides, mais les ajouter ici imposerait un
 * index composite par combinaison de filtres. Elles sont donc évaluées en
 * mémoire, sur l'ensemble déjà restreint au propriétaire.
 */
function buildQuery(filters: ExpenseFilters): FirebaseFirestore.Query<ExpenseDocument> {
  let query = expenses() as FirebaseFirestore.Query<ExpenseDocument>

  if (filters.owner_id) query = query.where('owner_id', '==', filters.owner_id)
  if (filters.property_id) query = query.where('property_id', '==', filters.property_id)
  if (filters.residence_id) query = query.where('residence_id', '==', filters.residence_id)
  if (filters.category) query = query.where('category', '==', filters.category)

  // Filtrage délégué à Firestore tant que la liste tient dans la limite de
  // l'opérateur `in` ; au-delà, `matchesInMemory` reprend après lecture.
  const ids = filters.scope_property_ids
  if (ids && ids.length > 0 && ids.length <= FIRESTORE_IN_LIMIT) {
    query = query.where('property_id', 'in', ids)
  }

  return query
}

export function matchesInMemory(doc: ExpenseRecord, filters: ExpenseFilters): boolean {
  const spentAt = doc.spent_at?.getTime() ?? 0

  if (filters.from && spentAt < filters.from.getTime()) return false
  if (filters.to && spentAt > filters.to.getTime()) return false

  // Le périmètre est repris ici dans les deux cas où `buildQuery` n'a pas pu le
  // confier à Firestore — périmètre vide, ou de plus de 30 logements, où `in`
  // lève. Sans ce second passage, la requête ne porterait aucune restriction et
  // un gérant verrait toutes les dépenses du propriétaire. Une charge commune
  // de résidence, sans `property_id`, n'appartient à aucun périmètre restreint.
  const ids = filters.scope_property_ids
  if (Array.isArray(ids)) {
    const scope = { ownerId: '', actorId: '', propertyIds: ids }
    if (!isWithinScope(scope, doc.property_id ?? null)) return false
  }

  return true
}

const Expense = {
  async findById(id: string): Promise<ExpenseRecord | null> {
    if (!id) return null
    return toDoc<ExpenseDocument>(await expenses().doc(id).get())
  },

  /** Lecture restreinte au propriétaire, pour l'espace privé. */
  async findByIdAndOwner(id: string, ownerId: string): Promise<ExpenseRecord | null> {
    const expense = await Expense.findById(id)
    if (!expense || expense.owner_id !== ownerId) return null
    return expense
  },

  async create(input: Partial<ExpenseDocument>): Promise<ExpenseRecord> {
    const payload = withDefaults(input)
    const docRef = await expenses().add(toPayload(payload) as unknown as ExpenseDocument)
    return { ...payload, _id: docRef.id }
  },

  /**
   * Met à jour une dépense, en vérifiant le périmètre avant écriture : sans ce
   * contrôle, un identifiant deviné suffirait à modifier la dépense d'autrui.
   */
  async findByIdAndUpdate(
    id: string,
    patch: Record<string, unknown>,
    ownerId?: string
  ): Promise<ExpenseRecord | null> {
    const current = await Expense.findById(id)
    if (!current) return null
    if (ownerId && current.owner_id !== ownerId) return null

    await expenses()
      .doc(id)
      .update(toPayload({ ...patch, updated_at: new Date() }))

    return Expense.findById(id)
  },

  async deleteOne(id: string, ownerId?: string): Promise<boolean> {
    const current = await Expense.findById(id)
    if (!current) return false
    if (ownerId && current.owner_id !== ownerId) return false

    await expenses().doc(id).delete()
    return true
  },

  /**
   * Liste paginée, la plus récente d'abord.
   *
   * Le tri porte sur `spent_at` — la date d'engagement, seule pertinente pour
   * un relevé de charges — et non sur `created_at`, qui refléterait l'ordre de
   * saisie.
   *
   * Il est fait en mémoire, et non par `orderBy` : combiné au `where` sur
   * `owner_id`, un tri Firestore exigerait un index composite par combinaison
   * de filtres, et la requête échouerait tant qu'il n'est pas déployé. Les
   * documents étant de toute façon tous rapatriés pour la découpe en pages,
   * l'`orderBy` n'apportait rien d'autre que cette contrainte.
   */
  async paginate(
    filters: ExpenseFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: ExpenseRecord[]; total: number }> {
    const snapshot = await buildQuery(filters).get()
    const all = toDocs<ExpenseDocument>(snapshot.docs)
      .filter((doc) => matchesInMemory(doc, filters))
      .sort((a, b) => (b.spent_at?.getTime() ?? 0) - (a.spent_at?.getTime() ?? 0))

    return {
      data: all.slice(options.offset, options.offset + options.limit),
      total: all.length,
    }
  },

  /**
   * Dépenses d'un propriétaire sur une période, toutes cibles confondues.
   *
   * Le relevé d'une résidence a besoin des deux rattachements à la fois — ses
   * charges communes et celles de ses unités — que `summary` ne sait pas
   * combiner : ses filtres sont des égalités, et un `where` sur `residence_id`
   * exclurait les charges d'unité.
   *
   * `scopePropertyIds` restreint la lecture au périmètre de l'appelant. Absent
   * ou `null`, le relevé reste celui du propriétaire — aucun appelant existant
   * ne change de comportement.
   */
  async findAllForOwner(
    ownerId: string,
    range: { from?: Date; to?: Date } = {},
    scopePropertyIds?: string[] | null
  ): Promise<ExpenseRecord[]> {
    const filters: ExpenseFilters = {
      owner_id: ownerId,
      ...range,
      scope_property_ids: scopePropertyIds,
    }

    // Le périmètre est confié à `buildQuery`, qui le délègue à Firestore quand
    // il tient dans l'opérateur `in` ; les bornes de date restent en mémoire,
    // pour ne pas exiger d'index composite. `matchesInMemory` réapplique les
    // deux, et reste la seule barrière sur liste vide ou de plus de 30.
    const snapshot = await buildQuery({
      owner_id: ownerId,
      scope_property_ids: scopePropertyIds,
    }).get()

    return toDocs<ExpenseDocument>(snapshot.docs).filter((doc) => matchesInMemory(doc, filters))
  },

  /**
   * Total dépensé et répartition par catégorie.
   *
   * Calculé sur l'ensemble filtré plutôt que par `sumQuery` : la ventilation
   * exige de toute façon de parcourir les documents, et un agrégat serveur par
   * catégorie multiplierait les requêtes.
   */
  async summary(filters: ExpenseFilters): Promise<{
    total: number
    count: number
    by_category: Array<{ category: ExpenseCategory; amount: number; count: number }>
  }> {
    const snapshot = await buildQuery(filters).get()
    const all = toDocs<ExpenseDocument>(snapshot.docs).filter((doc) =>
      matchesInMemory(doc, filters)
    )

    const buckets = new Map<ExpenseCategory, { amount: number; count: number }>()
    let total = 0

    for (const doc of all) {
      total += doc.amount
      const bucket = buckets.get(doc.category) ?? { amount: 0, count: 0 }
      bucket.amount += doc.amount
      bucket.count += 1
      buckets.set(doc.category, bucket)
    }

    return {
      total,
      count: all.length,
      // Décroissant : la ventilation sert à repérer les postes les plus lourds.
      by_category: [...buckets.entries()]
        .map(([category, bucket]) => ({ category, ...bucket }))
        .sort((a, b) => b.amount - a.amount),
    }
  },
}

export default Expense
