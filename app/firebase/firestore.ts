import { AggregateField, FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'

import type {
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore'

/**
 * Accès Firestore et conversions de représentation.
 *
 * Firestore ne connaît ni `ObjectId` ni `Date` JavaScript : il stocke des
 * identifiants de document (chaînes) et des `Timestamp`. Le reste de
 * l'application continue de manipuler des `string` et des `Date`, et la
 * traduction est confinée ici.
 *
 * Les documents lus exposent un champ `_id` — l'identifiant du document. Ce
 * nom vient de Mongo ; on le conserve pour que les couches supérieures
 * (use cases, helpers, DTO) restent inchangées par la migration.
 */

/** Nom des collections Firestore, centralisé pour éviter les chaînes libres. */
export const COLLECTIONS = {
  users: 'users',
  roles: 'roles',
  managerAssignments: 'manager_assignments',
  authSessions: 'auth_sessions',
  properties: 'properties',
  residences: 'residences',
  expenses: 'expenses',
  bookings: 'bookings',
  bookingPayments: 'booking_payments',
  paymentHistories: 'payment_histories',
  plans: 'plans',
  subscriptions: 'subscriptions',
  subscriptionEvents: 'subscription_events',
  promoCodes: 'promo_codes',
  promoCodeUsages: 'promo_code_usages',
  typeOfPieces: 'type_of_pieces',
  clients: 'clients',
  feedbacks: 'feedbacks',
  reportGenerations: 'report_generations',
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

/** Instance Firestore. Résolue à l'appel : le provider a déjà initialisé le SDK. */
export function db(): Firestore {
  return getFirestore()
}

/** Référence typée vers une collection. */
export function collection<T = DocumentData>(name: CollectionName): CollectionReference<T> {
  return db().collection(name) as CollectionReference<T>
}

/**
 * Document tel que manipulé par l'application : les champs stockés, plus
 * l'identifiant sous le nom `_id`.
 */
export type WithId<T> = T & { _id: string }

/**
 * Convertit récursivement les `Timestamp` Firestore en `Date`.
 *
 * Traverse les objets et tableaux imbriqués : les sous-documents
 * (`metadata.created_at`, `auth_providers[].linked_at`) contiennent eux aussi
 * des dates, et les laisser en `Timestamp` ferait échouer toute comparaison.
 */
function timestampsToDates<T>(value: T): T {
  if (value instanceof Timestamp) {
    return value.toDate() as unknown as T
  }

  if (Array.isArray(value)) {
    return value.map(timestampsToDates) as unknown as T
  }

  // On ne descend que dans les objets simples : les instances de classe
  // (Buffer, GeoPoint, DocumentReference…) doivent rester intactes.
  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = timestampsToDates(item)
    }
    return out as T
  }

  return value
}

/** Conversion inverse : `Date` → `Timestamp` avant écriture. */
function datesToTimestamps<T>(value: T): T {
  if (value instanceof Date) {
    return Timestamp.fromDate(value) as unknown as T
  }

  if (Array.isArray(value)) {
    return value.map(datesToTimestamps) as unknown as T
  }

  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = datesToTimestamps(item)
    }
    return out as T
  }

  return value
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Transforme un snapshot en objet applicatif : identifiant sous `_id`,
 * `Timestamp` reconvertis en `Date`.
 *
 * Retourne `null` pour un document absent, ce qui laisse les appelants écrire
 * `if (!user)` comme avec `findOne` de Mongoose.
 */
export function toDoc<T>(snapshot: DocumentSnapshot | QueryDocumentSnapshot): WithId<T> | null {
  if (!snapshot.exists) return null

  const data = snapshot.data()
  if (!data) return null

  return { ...timestampsToDates(data), _id: snapshot.id } as WithId<T>
}

/** Applique `toDoc` à un résultat de requête, en écartant les documents vides. */
export function toDocs<T>(
  snapshots: Array<DocumentSnapshot | QueryDocumentSnapshot>
): Array<WithId<T>> {
  const out: Array<WithId<T>> = []
  for (const snapshot of snapshots) {
    const doc = toDoc<T>(snapshot)
    if (doc) out.push(doc)
  }
  return out
}

/**
 * Prépare un objet pour l'écriture : `Date` converties, `_id` retiré.
 *
 * `_id` n'a pas à être dupliqué dans le corps du document — c'est déjà la clé.
 * Le laisser créerait deux sources de vérité qui divergeraient à la première
 * copie de document.
 */
export function toPayload<T extends object>(data: T): Record<string, unknown> {
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (key !== '_id') rest[key] = value
  }
  return datesToTimestamps(rest)
}

/**
 * Prépare un patch partiel : objets imbriqués aplatis en chemins pointés.
 *
 * `update({ details: { bedrooms: 3 } })` **remplace** l'objet `details`
 * entier chez Firestore. Les validateurs de mise à jour rendant chaque
 * sous-champ optionnel, un PATCH ne portant qu'un champ effaçait tous les
 * autres : envoyer `{ pricing: { daily_price: 25000 } }` supprimait
 * `price_tiers`, et toute la grille de remises disparaissait sans erreur.
 *
 * `update({ 'details.bedrooms': 3 })` ne touche que ce champ. La conversion
 * en chemins est donc faite ici, et non par une fusion lire-puis-écrire, qui
 * ne serait pas atomique : deux PATCH concurrents en perdraient un.
 *
 * Un tableau est une valeur terminale et se remplace en entier : `price_tiers`
 * envoyé par le propriétaire est la liste complète, pas un ajout. Un `null`
 * est également terminal — c'est un effacement voulu.
 */
export function toMergePayload<T extends object>(data: T): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  const walk = (value: unknown, prefix: string) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !Array.isArray(value) &&
      isPlainObject(value)
    ) {
      // Un objet vide n'a aucun chemin à écrire, et émettre le chemin parent
      // écraserait l'objet existant — le bug même que cette fonction corrige.
      for (const [key, item] of Object.entries(value)) {
        walk(item, prefix ? `${prefix}.${key}` : key)
      }
      return
    }

    flat[prefix] = datesToTimestamps(value)
  }

  for (const [key, value] of Object.entries(data)) {
    if (key === '_id') continue
    walk(value, key)
  }

  return flat
}

/**
 * Incrément atomique d'un champ numérique — équivalent de `$inc`.
 *
 * Le compteur est ajusté côté serveur : deux incréments concurrents
 * s'additionnent, là où un lire-puis-écrire en perdrait un.
 */
export function increment(by = 1) {
  return FieldValue.increment(by)
}

/** Horodatage posé par le serveur, insensible à l'heure de la machine. */
export function serverTimestamp() {
  return FieldValue.serverTimestamp()
}

/**
 * Compte les documents d'une requête sans les rapatrier.
 *
 * Remplace `countDocuments`. L'agrégat est calculé côté serveur : le coût ne
 * dépend pas du nombre de documents concernés.
 */
export async function countQuery(query: Query): Promise<number> {
  const snapshot = await query.count().get()
  return snapshot.data().count
}

/**
 * Somme d'un champ numérique sur une requête, calculée côté serveur.
 * Remplace un `$group` / `$sum` d'agrégation Mongo.
 */
export async function sumQuery(query: Query, field: string): Promise<number> {
  const snapshot = await query.aggregate({ total: AggregateField.sum(field) }).get()
  return snapshot.data().total ?? 0
}

/**
 * Exécute une transaction Firestore.
 *
 * Contrainte à connaître : **toutes les lectures doivent précéder toutes les
 * écritures**. Un `tx.get()` après un `tx.update()` lève. Les transactions Mongo
 * ne posaient pas cette règle — c'est le principal point de vigilance lors du
 * portage d'un `withTransaction`.
 */
export function transaction<T>(
  handler: (tx: FirebaseFirestore.Transaction) => Promise<T>
): Promise<T> {
  return db().runTransaction(handler)
}

/**
 * Supprime tous les documents d'une requête, par lots.
 *
 * Firestore n'a pas de `deleteMany` : un batch plafonne à 500 opérations, d'où
 * la boucle.
 */
export async function deleteQuery(query: Query, batchSize = 500): Promise<number> {
  let total = 0

  for (;;) {
    const snapshot = await query.limit(batchSize).get()
    if (snapshot.empty) break

    const batch = db().batch()
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref)
    }
    await batch.commit()

    total += snapshot.size
    if (snapshot.size < batchSize) break
  }

  return total
}
