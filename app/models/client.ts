import {
  COLLECTIONS,
  collection,
  countQuery,
  toDoc,
  toDocs,
  toPayload,
  type WithId,
} from '#firebase/firestore'

/**
 * Carnet de clients d'un propriétaire.
 *
 * Distinct de `users` : ces clients se présentent au comptoir et n'ont pas de
 * compte sur la plateforme. Les mêler aux utilisateurs mêlerait des fiches qui
 * ne se connecteront jamais aux contraintes de l'authentification (unicité
 * globale de l'e-mail, statut de validation, sessions).
 *
 * Le carnet est scoppé par `owner_id` : deux propriétaires peuvent avoir le
 * même client, chacun avec sa fiche et ses pièces. Aucun propriétaire ne doit
 * pouvoir constater l'existence des clients d'un autre.
 */

export const ID_DOCUMENT_TYPES = ['cni', 'passeport', 'permis'] as const
export type ClientIdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

export const CLIENT_STATUSES = ['active', 'archived'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export interface ClientStats {
  total_stays: number
  total_paid: number
  last_stay_at: Date | null
}

export interface ClientDocument {
  owner_id: string

  full_name: string
  /** Normalisé via `normalizePhone` : c'est la clé de dédoublonnage. */
  phone: string
  whatsapp: string | null

  id_document_type: ClientIdDocumentType | null
  id_document_number: string | null
  /**
   * Références Cloudinary privées, jamais des URLs : une URL signée expire, et
   * la persister produirait des liens morts. L'URL est régénérée à la lecture.
   */
  id_document_front_public_id: string | null
  id_document_back_public_id: string | null
  /** `complete` dès que les deux faces sont déposées. */
  documents_status: 'complete' | 'pending'

  stats: ClientStats
  status: ClientStatus

  /**
   * Acteur ayant réellement saisi l'enregistrement — un gérant, ou `null` pour
   * le propriétaire. Optionnel : absent sur les documents antérieurs au rôle
   * gérant. Donnée d'audit, n'entrant dans aucun calcul.
   */
  created_by?: string | null

  created_at: Date
  updated_at: Date
}

export type ClientRecord = WithId<ClientDocument>

function clients() {
  return collection<ClientDocument>(COLLECTIONS.clients)
}

/**
 * Forme canonique d'un numéro de téléphone.
 *
 * Le numéro identifie le client : « 07 12 34 56 78 » et « 0712345678 » doivent
 * désigner la même fiche, sans quoi le dédoublonnage laisserait passer un
 * doublon à la première saisie espacée.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-.()]/g, '')
}

/** Complétude du dossier : les deux faces sont-elles déposées ? */
function resolveDocumentsStatus(front: string | null, back: string | null) {
  return front && back ? ('complete' as const) : ('pending' as const)
}

export interface ClientFilters {
  owner_id: string
  status?: ClientStatus
}

/** Fiche telle que `Client.create` la reçoit. */
export interface CreateClientDocumentInput {
  owner_id: string
  full_name: string
  phone: string
  whatsapp?: string | null
  id_document_type?: ClientIdDocumentType | null
  id_document_number?: string | null
  id_document_front_public_id?: string | null
  id_document_back_public_id?: string | null
  created_by?: string | null
}

/**
 * Compose le document d'une fiche client.
 *
 * Extraite de `Client.create` pour être éprouvée sans Firestore : la
 * composition énumère ses champs un à un, si bien qu'un `created_by` calculé en
 * amont s'y perdrait sans la moindre erreur de compilation. C'est pourtant lui
 * qui rend une fiche saisie au comptoir visible à son créateur avant sa
 * première réservation — perdu, la fiche disparaîtrait de son carnet.
 */
export function buildClientPayload(input: CreateClientDocumentInput, now: Date): ClientDocument {
  const front = input.id_document_front_public_id ?? null
  const back = input.id_document_back_public_id ?? null

  return {
    owner_id: input.owner_id,
    full_name: input.full_name,
    phone: normalizePhone(input.phone),
    whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
    id_document_type: input.id_document_type ?? null,
    id_document_number: input.id_document_number ?? null,
    id_document_front_public_id: front,
    id_document_back_public_id: back,
    documents_status: resolveDocumentsStatus(front, back),
    stats: { total_stays: 0, total_paid: 0, last_stay_at: null },
    status: 'active',
    created_by: input.created_by ?? null,
    created_at: now,
    updated_at: now,
  }
}

const Client = {
  async findById(id: string): Promise<ClientRecord | null> {
    if (!id) return null
    return toDoc<ClientDocument>(await clients().doc(id).get())
  },

  /**
   * Fiche d'un propriétaire portant ce numéro.
   *
   * Firestore n'ayant pas d'index unique, l'unicité de `(owner_id, phone)` est
   * applicative : cette lecture est le contrôle qui la porte.
   */
  async findByPhone(ownerId: string, phone: string): Promise<ClientRecord | null> {
    const snapshot = await clients()
      .where('owner_id', '==', ownerId)
      .where('phone', '==', normalizePhone(phone))
      .limit(1)
      .get()

    if (snapshot.empty) return null
    return toDoc<ClientDocument>(snapshot.docs[0])
  },

  async create(input: CreateClientDocumentInput): Promise<ClientRecord> {
    const payload = buildClientPayload(input, new Date())

    const docRef = await clients().add(toPayload(payload) as unknown as ClientDocument)
    return { ...payload, _id: docRef.id }
  },

  /**
   * Met à jour une fiche, restreinte à son propriétaire.
   *
   * Le périmètre est vérifié avant écriture : sans lui, un propriétaire
   * pourrait modifier la fiche d'un autre en devinant son identifiant.
   */
  async update(
    id: string,
    ownerId: string,
    patch: Partial<Omit<ClientDocument, 'owner_id' | 'created_at'>>
  ): Promise<ClientRecord | null> {
    const current = await Client.findById(id)
    if (!current || current.owner_id !== ownerId) return null

    const next = { ...patch, updated_at: new Date() } as Record<string, unknown>

    if (patch.phone) next.phone = normalizePhone(patch.phone)

    // La complétude se recalcule dès qu'une face bouge, sinon un dossier
    // complété resterait marqué « en attente ».
    if ('id_document_front_public_id' in patch || 'id_document_back_public_id' in patch) {
      const front = patch.id_document_front_public_id ?? current.id_document_front_public_id ?? null
      const back = patch.id_document_back_public_id ?? current.id_document_back_public_id ?? null
      next.documents_status = resolveDocumentsStatus(front, back)
    }

    await clients().doc(id).update(toPayload(next))
    return Client.findById(id)
  },

  async paginate(
    filters: ClientFilters,
    options: { limit: number; offset: number }
  ): Promise<{ data: ClientRecord[]; total: number }> {
    let query = clients().where(
      'owner_id',
      '==',
      filters.owner_id
    ) as FirebaseFirestore.Query<ClientDocument>

    if (filters.status) query = query.where('status', '==', filters.status)

    const [snapshot, total] = await Promise.all([
      query.orderBy('updated_at', 'desc').offset(options.offset).limit(options.limit).get(),
      countQuery(query),
    ])

    return { data: toDocs<ClientDocument>(snapshot.docs), total }
  },

  /**
   * Réaligne le cache de statistiques sur une valeur recalculée.
   *
   * Remplace l'ancien cumul incrémental : incrémenter à la clôture laissait
   * dériver le compteur dès qu'un séjour était annulé après coup ou qu'un
   * montant était corrigé, sans moyen de le réaligner. Les statistiques se
   * dérivent désormais des réservations, seule source de vérité.
   *
   * `updated_at` n'est volontairement pas touché : le carnet est trié dessus,
   * et un simple rafraîchissement de cache ne doit pas réordonner la liste
   * comme le ferait une modification de la fiche.
   */
  async updateStats(id: string, stats: ClientStats): Promise<void> {
    await clients().doc(id).update(toPayload({ stats }))
  },
}

export default Client
